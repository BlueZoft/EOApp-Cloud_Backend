FROM node:20-alpine

WORKDIR /

COPY . /

RUN npm install

EXPOSE 5000

ENV MONGO_URI 

CMD [ "npm" , "start" ]
