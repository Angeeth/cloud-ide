FROM openjdk:17-alpine
WORKDIR /workspace
RUN adduser -D -u 1000 sandboxuser
USER sandboxuser
CMD ["sh", "-c", "javac Main.java && java Main"]
