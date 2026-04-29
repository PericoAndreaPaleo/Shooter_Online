FROM php:8.2-apache

# Abilita l'estensione PDO MySQL
RUN docker-php-ext-install pdo pdo_mysql

# Copia i file PHP nella root di Apache
COPY php/ /var/www/html/

# Espone la porta 80 (Render la mappa automaticamente)
EXPOSE 80