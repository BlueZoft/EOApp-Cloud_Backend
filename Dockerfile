FROM node:20-alpine

WORKDIR /

COPY . /

RUN npm install

EXPOSE 5000

ENV MONGO_URI mongodb+srv://Hetarata_Admin:w9blGGJt3N25X30A@hetarata.17wbc.mongodb.net/?retryWrites=true&w=majority&appName=Hetarata

CMD [ "npm" , "start" ]