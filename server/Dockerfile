# mind-the-dag group library: PocketBase with the map collection baked in.
# Runs on Rahti (OpenShift) as an arbitrary non-root user; data lives in /pb_data.
FROM alpine:3.22

ARG PB_VERSION=0.40.5
ARG PB_SHA256=""

RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
 && if [ -n "$PB_SHA256" ]; then echo "$PB_SHA256  /tmp/pb.zip" | sha256sum -c -; fi \
 && unzip -q /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip \
 && mkdir -p /pb_data && chgrp -R 0 /pb_data && chmod -R g=u /pb_data

COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks

EXPOSE 8090
ENV ORIGINS="https://marveloushaotian.github.io"

CMD ["sh", "-c", "exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks --hooksWatch=false --automigrate=false --origins=\"$ORIGINS\""]
