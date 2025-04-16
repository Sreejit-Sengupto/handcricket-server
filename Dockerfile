FROM node:22-alpine


WORKDIR /app/

COPY package.json /app/

RUN npm install

COPY . .

RUN npx tsc --build

EXPOSE 3000

CMD [ "node", "dist/index.ts" ]