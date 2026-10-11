# Build the React app, then serve it with nginx. The API addresses are fixed at build time (REACT_APP_*).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG REACT_APP_AUTH_API_URL
ARG REACT_APP_ACTION_PLAN_API_URL
ARG REACT_APP_ML_API_URL
ENV REACT_APP_AUTH_API_URL=$REACT_APP_AUTH_API_URL \
    REACT_APP_ACTION_PLAN_API_URL=$REACT_APP_ACTION_PLAN_API_URL \
    REACT_APP_ML_API_URL=$REACT_APP_ML_API_URL \
    GENERATE_SOURCEMAP=false
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
