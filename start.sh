#!/bin/bash

# Avvia Apache/PHP sulla porta 8080
sed -i 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf
sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8080>/' /etc/apache2/sites-enabled/000-default.conf
apache2ctl start

# Avvia Node.js sulla porta 4000
cd /app
PORT=4000 node server/server.js &

# Avvia Nginx in foreground (processo principale)
nginx -g "daemon off;" -c /etc/nginx/nginx.conf