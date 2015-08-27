FROM ubuntu
RUN apt-get update
RUN apt-get install -y git nodejs npm
RUN git clone git://github.com/DuoSoftware/DVP-DBModels.git /usr/local/src/dbmodels
RUN cd /usr/local/src/dbmodels; npm install
CMD ["nodejs", "/usr/local/src/dbmodels/DBCreatorApi.js"]

EXPOSE 8822