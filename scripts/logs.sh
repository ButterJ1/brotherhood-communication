#!/bin/bash

if [ $# -eq 0 ]; then
    echo "📝 查看所有服務日誌..."
    docker-compose logs -f
else
    echo "📝 查看 $1 服務日誌..."
    docker-compose logs -f $1
fi
