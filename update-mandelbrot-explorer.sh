if ! docker build -t mandelbrot-explorer .; then
    echo "Docker build failed!"
    exit 1
fi
docker stop mandelbrot-explorer
docker rm mandelbrot-explorer
docker run \
    --name mandelbrot-explorer \
    --add-host=host.docker.internal:host-gateway \
    --restart always \
  -p 8090:8000 \
  -d mandelbrot-explorer