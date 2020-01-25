#FROM ubuntu
#RUN apt-get update
#RUN apt-get install -y git nodejs npm
#RUN git clone git://github.com/DuoSoftware/DVP-EventMonitor.git /usr/local/src/eventmonitor
#RUN cd /usr/local/src/eventmonitor; npm install
#CMD ["nodejs", "/usr/local/src/eventmonitor/app.js"]

#EXPOSE 8806

# FROM node:5.10.0
# ARG VERSION_TAG
# RUN git clone -b $VERSION_TAG https://github.com/DuoSoftware/DVP-EventMonitor.git /usr/local/src/eventmonitor
# RUN cd /usr/local/src/eventmonitor;
# WORKDIR /usr/local/src/eventmonitor
# RUN npm install
# EXPOSE 8806
# CMD [ "node", "/usr/local/src/eventmonitor/app.js" ]

FROM node:10-alpine
WORKDIR /usr/local/src/sipuserendpointservice
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8814
CMD [ "node", "app.js" ]
