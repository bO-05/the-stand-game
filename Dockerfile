FROM nginx:alpine

# Remove default configuration and static files
RUN rm /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy build output files to the Nginx html folder
COPY dist /usr/share/nginx/html

# Expose port 8080 (default for Cloud Run)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
