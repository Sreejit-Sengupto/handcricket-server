FROM node:22-alpine


WORKDIR /src/

COPY package.json /src/

RUN npm install

COPY . .

RUN npx tsc --build

EXPOSE 3000

CMD [ "node", "dist/index.js" ]