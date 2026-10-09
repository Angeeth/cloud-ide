FROM gcc:12
WORKDIR /workspace
RUN useradd -m -u 1000 sandboxuser
USER sandboxuser
CMD ["sh", "-c", "g++ -O2 main.cpp -o main && ./main"]
