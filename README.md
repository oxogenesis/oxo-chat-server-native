# oxo-chat-server
消息服务器
* 消息转发功能
* 公告缓存功能
* 简单的网站功能（在线账户列表、公告展示）

# code
**[client](https://github.com/oxogenesis/oxo-chat-client)**  
**[router](https://github.com/oxogenesis/oxo-chat-router)**  
**[server](https://github.com/oxogenesis/oxo-chat-server)**  

# wiki
**[1.关于密码学](https://github.com/oxogenesis/oxo-chat-client/wiki/1.%E5%85%B3%E4%BA%8E%E5%AF%86%E7%A0%81%E5%AD%A6)**  
**[2.系统描述](https://github.com/oxogenesis/oxo-chat-client/wiki/2.%E7%B3%BB%E7%BB%9F%E6%8F%8F%E8%BF%B0)**  
**[3.业务消息](https://github.com/oxogenesis/oxo-chat-client/wiki/3.%E4%B8%9A%E5%8A%A1%E6%B6%88%E6%81%AF)**  
**[4.数据存储](https://github.com/oxogenesis/oxo-chat-client/wiki/4.%E6%95%B0%E6%8D%AE%E5%AD%98%E5%82%A8)**  

# run code
$ npm install  
$ node main.js  

# deploy with ssl, nginx, pm2
sudo apt install nginx  
sudo ufw allow 'Nginx Full'  
sudo ufw allow 22/tcp  
sudo ufw enable  
sudo ufw status  

sudo add-apt-repository ppa:certbot/certbot  
sudo apt update  
sudo apt install python-certbot-nginx  

sudo certbot --nginx -d oxo-chat-server.com -d ru.oxo-chat-server.com  
Enter your email address  
Enter “A” for Agree  
Enter “Y” for Yes  
Enter “2”  
sudo certbot renew --dry-run  
  
sudo mv /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup  
sudo nano /etc/nginx/sites-available/default  
  
```
#https on 80 from localhost:8000
server {  
  listen 443 ssl;  
  server_name oxo-chat-server.com;  
  ssl_certificate /etc/letsencrypt/live/oxo-chat-server.com/fullchain.pem;  
  ssl_certificate_key /etc/letsencrypt/live/oxo-chat-server.com/privkey.pem;  
  ssl_protocols TLSv1.2;  
  ssl_prefer_server_ciphers on;  
  ssl_ciphers EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH;  
  root /usr/share/nginx/html;  
  index index.html index.htm;  
  
  server_name localhost;  
  location / {
    proxy_pass http://localhost:8000/;  
    proxy_http_version 1.1;  
    proxy_set_header Host $http_host;  
    proxy_set_header X-Real-IP $remote_addr;  
    proxy_set_header X-Forward-For $proxy_add_x_forwarded_for;  
    proxy_set_header X-Forward-Proto http;  
    proxy_set_header X-Nginx-Proxy true;  
    proxy_redirect off;  
  }
}
  
server {  
  listen 80;  
  server_name oxo-chat-server.com;  
  return 301 https://$host$request_uri;  
}  
  

#wss on 80 from localhost:3000
server {  
  listen 443 ssl;  
  server_name ru.oxo-chat-server.com;  
  ssl_certificate /etc/letsencrypt/live/oxo-chat-server.com/fullchain.pem;  
  ssl_certificate_key /etc/letsencrypt/live/oxo-chat-server.com/privkey.pem;  
  ssl_protocols TLSv1.2;  
  ssl_prefer_server_ciphers on;  
  ssl_ciphers EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH;  
  root /usr/share/nginx/html;  
  index index.html index.htm;  
  
  server_name localhost;  
  location / {
    proxy_pass http://localhost:3000/;  
    proxy_http_version 1.1;  
    proxy_set_header Upgrade $http_upgrade;  
    proxy_set_header Connection "upgrade";  
    proxy_set_header Host $http_host;  
    proxy_set_header X-Real-IP $remote_addr;  
    proxy_connect_timeout 1d;  
    proxy_send_timeout 1d;  
    proxy_read_timeout 1d;  
  }
}
  
server {  
  listen 80;  
  server_name ru.oxo-chat-server.com;  
  return 301 https://$host$request_uri;  
}  
```

sudo nginx -t  
sudo systemctl reload nginx  
  
sudo npm install -g pm2  
pm2 start main.js  
