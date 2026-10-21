import io
import os
import tarfile
import time
import tempfile
import subprocess
import docker
from typing import Dict, Tuple, List
from config import settings
from shared.common.logging import setup_logging

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

class ExecutionEngine:
    def __init__(self):
        self.docker_client = None
        try:
            self.docker_client = docker.from_env()
            self.docker_client.ping()
            logger.info("ExecutionEngine connected to Docker daemon successfully.")
        except Exception as e:
            logger.warning(f"Docker daemon not accessible ({e}). Initializing fallback local subprocess execution engine.")

    def _resolve_entry_point(self, lang: str, file_keys: List[str]) -> str:
        targets = {
            "python": ["main.py", "src/main.py", "app.py", "src/app.py"],
            "javascript": ["index.js", "src/index.js", "main.js", "src/main.js", "app.js"],
            "java": ["Main.java", "src/Main.java"],
            "c": ["main.c", "src/main.c"],
            "cpp": ["main.cpp", "src/main.cpp", "main.c", "src/main.c"]
        }
        candidates = targets.get(lang, ["main.py", "src/main.py"])
        norm_keys = [k.lstrip("/\\").replace("\\", "/") for k in file_keys]
        for rel_p in candidates:
            if rel_p in norm_keys:
                return rel_p

        extensions = {
            "python": [".py"],
            "javascript": [".js", ".mjs"],
            "java": [".java"],
            "c": [".c"],
            "cpp": [".cpp", ".cc", ".cxx"]
        }
        exts = extensions.get(lang, [])
        for k in norm_keys:
            if any(k.endswith(ext) for ext in exts):
                return k

        return candidates[0]

    def _create_tar_archive(self, files_dict: Dict[str, str]) -> bytes:
        tar_stream = io.BytesIO()
        with tarfile.open(fileobj=tar_stream, mode="w") as tar:
            for rel_path, content in files_dict.items():
                clean_path = rel_path.lstrip("/\\").replace("\\", "/")
                data = (content or "").encode("utf-8")
                ti = tarfile.TarInfo(name=clean_path)
                ti.size = len(data)
                ti.mtime = int(time.time())
                ti.mode = 0o755
                tar.addfile(ti, io.BytesIO(data))
        return tar_stream.getvalue()

    def run_code(self, language: str, files_dict: Dict[str, str], entry_point: str = None) -> Tuple[str, str, int, float, str]:
        """
        Runs code for supported language (python, javascript, java, c, cpp).
        Returns: (stdout, stderr, exit_code, duration_ms, status)
        """
        lang = language.lower()
        if lang == "cpp":
            lang = "c"

        start_time = time.time()
        timeout = settings.EXECUTION_TIMEOUT_SECONDS

        resolved_entry = entry_point or self._resolve_entry_point(lang, list(files_dict.keys()))

        if self.docker_client:
            try:
                return self._run_in_docker(lang, files_dict, resolved_entry, timeout, start_time)
            except Exception as e:
                logger.error(f"Docker execution failed: {e}. Falling back to local subprocess.")
                return self._run_in_subprocess(lang, files_dict, resolved_entry, timeout, start_time)
        else:
            return self._run_in_subprocess(lang, files_dict, resolved_entry, timeout, start_time)

    def _run_in_docker(self, lang: str, files_dict: Dict[str, str], entry: str, timeout: int, start_time: float) -> Tuple[str, str, int, float, str]:
        entry_dir = os.path.dirname(entry).replace("\\", "/")
        entry_file = os.path.basename(entry)

        if lang == "python":
            image_name, cmd = "python:3.11-slim", ["python", entry]
        elif lang == "javascript":
            image_name, cmd = "node:20-alpine", ["node", entry]
        elif lang == "java":
            image_name = "openjdk:17-alpine"
            cd_cmd = f"cd {entry_dir} && " if entry_dir else ""
            cmd = ["sh", "-c", f"{cd_cmd}javac {entry_file} && java {entry_file.replace('.java', '')}"]
        elif lang in ("c", "cpp"):
            image_name = "gcc:12"
            compiler = "g++" if lang == "cpp" else "gcc"
            cmd = ["sh", "-c", f"{compiler} -O2 {entry} -o /tmp/main && /tmp/main"]
        else:
            return ("", f"Unsupported programming language: {lang}", 1, 0.0, "ERROR")

        container = None
        try:
            try:
                container = self.docker_client.containers.create(
                    image=image_name,
                    command=cmd,
                    working_dir="/workspace",
                    network_mode="none",
                    mem_limit=settings.EXECUTION_MAX_MEMORY,
                    nano_cpus=int(settings.EXECUTION_MAX_CPU * 1e9),
                    detach=True
                )
            except docker.errors.ImageNotFound:
                logger.info(f"Execution sandbox image {image_name} not found locally, pulling...")
                self.docker_client.images.pull(image_name)
                container = self.docker_client.containers.create(
                    image=image_name,
                    command=cmd,
                    working_dir="/workspace",
                    network_mode="none",
                    mem_limit=settings.EXECUTION_MAX_MEMORY,
                    nano_cpus=int(settings.EXECUTION_MAX_CPU * 1e9),
                    detach=True
                )

            # Stream workspace files directly into container filesystem via put_archive
            tar_data = self._create_tar_archive(files_dict)
            container.put_archive("/workspace", tar_data)

            container.start()

            result = container.wait(timeout=timeout)
            exit_code = result.get("StatusCode", 0)
            logs = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace")
            errors = container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace")
            duration = round((time.time() - start_time) * 1000, 2)
            status_str = "SUCCESS" if exit_code == 0 else "ERROR"
            return (logs[:settings.EXECUTION_MAX_OUTPUT_BYTES], errors[:settings.EXECUTION_MAX_OUTPUT_BYTES], exit_code, duration, status_str)

        except Exception as e:
            if container:
                try:
                    container.kill()
                except Exception:
                    pass
            duration = round((time.time() - start_time) * 1000, 2)
            if "timeout" in str(e).lower() or (time.time() - start_time) >= timeout:
                return ("", f"Execution timed out after {timeout} seconds.", 124, duration, "TIMEOUT")
            raise e
        finally:
            if container:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

    def _run_in_subprocess(self, lang: str, files_dict: Dict[str, str], entry: str, timeout: int, start_time: float) -> Tuple[str, str, int, float, str]:
        with tempfile.TemporaryDirectory() as temp_dir:
            for rel_path, content in files_dict.items():
                clean_path = rel_path.lstrip("/\\").replace("/", os.sep)
                full_p = os.path.join(temp_dir, clean_path)
                os.makedirs(os.path.dirname(full_p), exist_ok=True)
                with open(full_p, "w", encoding="utf-8") as f:
                    f.write(content or "")

            entry_full = os.path.join(temp_dir, entry.replace("/", os.sep))
            entry_dir = os.path.dirname(entry_full)
            entry_file = os.path.basename(entry_full)

            if lang == "python":
                cmd = ["python", entry_full]
            elif lang == "javascript":
                cmd = ["node", entry_full]
            elif lang == "java":
                cmd = f"cd \"{entry_dir}\" && javac {entry_file} && java {entry_file.replace('.java', '')}"
            elif lang in ("c", "cpp"):
                compiler = "g++" if lang == "cpp" else "gcc"
                out_exe = os.path.join(temp_dir, "main.exe" if os.name == "nt" else "main")
                cmd = f"{compiler} -O2 \"{entry_full}\" -o \"{out_exe}\" && \"{out_exe}\""
            else:
                return ("", f"Unsupported programming language: {lang}", 1, 0.0, "ERROR")

            try:
                is_shell = isinstance(cmd, str)
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    shell=is_shell,
                    cwd=temp_dir
                )

                try:
                    stdout, stderr = proc.communicate(timeout=timeout)
                    duration = round((time.time() - start_time) * 1000, 2)
                    exit_code = proc.returncode
                    status_str = "SUCCESS" if exit_code == 0 else "ERROR"
                    return (stdout[:settings.EXECUTION_MAX_OUTPUT_BYTES], stderr[:settings.EXECUTION_MAX_OUTPUT_BYTES], exit_code, duration, status_str)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    duration = round((time.time() - start_time) * 1000, 2)
                    return ("", f"Execution timed out after {timeout} seconds.", 124, duration, "TIMEOUT")

            except Exception as e:
                duration = round((time.time() - start_time) * 1000, 2)
                return ("", f"Execution failed: {str(e)}", 1, duration, "ERROR")

execution_engine = ExecutionEngine()
