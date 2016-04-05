#FROM ubuntu
#RUN apt-get update
#RUN apt-get install -y git nodejs npm
#RUN git clone git://github.com/DuoSoftware/DVP-EventMonitor.git /usr/local/src/eventmonitor
#RUN cd /usr/local/src/eventmonitor; npm install
#CMD ["nodejs", "/usr/local/src/eventmonitor/app.js"]

#EXPOSE 8806

FROM node:argon
RUN npm install npm
RUN git clone git://github.com/DuoSoftware/DVP-EventMonitor.git /usr/local/src/eventmonitor
RUN cd /usr/local/src/eventmonitor;
WORKDIR /usr/local/src/eventmonitor
RUN npm install
EXPOSE 8806
CMD [ "node", "/usr/local/src/eventmonitor/app.js" ]
