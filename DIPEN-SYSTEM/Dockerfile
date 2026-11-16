# Multi-stage build for DIPEN SYSTEM — Manufacturing ERP (Java 21 + Spring Boot + HTML/CSS/JS)
FROM maven:3.9.9-eclipse-temurin-21 AS builder
WORKDIR /build
COPY backend/pom.xml .
RUN mvn dependency:go-offline -B
COPY backend/src ./src
RUN mvn clean package -DskipTests -B

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Install default-mysql-client so BackupService scheduled mysqldump works inside container
RUN apt-get update && apt-get install -y --no-install-recommends default-mysql-client curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/dipen-erp-1.0.0.jar /app/dipen-erp.jar

RUN mkdir -p /app/backups /app/secrets
EXPOSE 8080

ENV SERVER_PORT=8080 \
    DIPEN_BACKUP_DIR=/app/backups \
    JAVA_OPTS="-Xms256m -Xmx1024m -XX:+UseG1GC -Duser.timezone=Asia/Kathmandu"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/dipen-erp.jar"]
