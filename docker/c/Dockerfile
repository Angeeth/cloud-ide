FROM gcc:12
WORKDIR /workspace
RUN useradd -m -u 1000 sandboxuser
USER sandboxuser
CMD ["sh", "-c", "gcc -O2 main.c -o main && ./main"]
