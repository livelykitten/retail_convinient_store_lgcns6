# 백엔드 배포 이미지 (Railway 등). 빌드: backend/ 에서 docker build -t retail-backend .
# 비밀 값(카카오 · TMAP · Claude 키)은 이미지에 넣지 않고, 실행 환경 변수로 넣는다.

# 1. 빌드: 테스트는 PR에서 돌리므로 여기서는 빼고 실행 jar만 만든다
FROM eclipse-temurin:17-jdk AS build
WORKDIR /app
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon bootJar -x test \
    && find build/libs -name '*.jar' ! -name '*-plain.jar' -exec cp {} app.jar \;

# 2. 실행
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/app.jar app.jar

# 배포 환경에서는 H2 웹 콘솔을 끈다 (로컬 application.properties는 켜 둠)
ENV SPRING_H2_CONSOLE_ENABLED=false \
    JAVA_OPTS="-XX:MaxRAMPercentage=75"

# Railway는 PORT 환경 변수로 포트를 준다. 없으면 8080
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Dserver.port=${PORT:-8080} -jar app.jar"]
