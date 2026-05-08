FROM php:8.2-apache

# Installa Node.js 20 e Nginx
RUN apt-get update && apt-get install -y \
    curl \
    nginx \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && docker-php-ext-install pdo pdo_mysql \
    && rm -rf /var/lib/apt/lists/*

# Copia i file PHP in Apache
COPY php/ /var/www/html/

# Copia il progetto Node
COPY . /app/
WORKDIR /app
RUN npm install

# Copia la configurazione Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Copia e rendi eseguibile lo script di avvio
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 10000

CMD ["/start.sh"]