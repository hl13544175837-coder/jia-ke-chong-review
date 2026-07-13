.PHONY: build push clean all frontend server buildfrontend pushfrontend cleanfrontend buildserver pushserver cleanserver

# Environment variables that can be overridden by GitLab CI
PKG_TAG ?= RC
PKG_VERSION ?= $(shell date +%Y%m%d%H%M)

ifeq ($(strip $(PKG_TAG)),)
	override PKG_TAG := RC
endif

ifeq ($(strip $(PKG_VERSION)),)
	override PKG_VERSION := $(shell date +%Y%m%d%H%M)
endif

# Determine registry based on PKG_TAG
ifeq ($(PKG_TAG),GA)
	REGISTRY = registry.ymdd.tech
	AUTO_MIGRATE_DATABASE = false
	ALLOW_EMPTY_DATABASE_BOOTSTRAP = false
	ALLOW_INSECURE_SIT_STARTUP = false
	SECURITY_HEADERS_ENABLED = true
	RATE_LIMIT_ENABLED = true
	ALLOW_PUBLIC_REGISTRATION = false
else
	REGISTRY = registry-sit.uce.cn
	AUTO_MIGRATE_DATABASE = true
	ALLOW_EMPTY_DATABASE_BOOTSTRAP = true
	ALLOW_INSECURE_SIT_STARTUP = true
	SECURITY_HEADERS_ENABLED = false
	RATE_LIMIT_ENABLED = false
	ALLOW_PUBLIC_REGISTRATION = true
endif

ZHIPIN_FRONTEND_REPO = system-zhipin-mvp/zhipin-frontend
ZHIPIN_SERVER_REPO = system-zhipin-mvp/zhipin-server

ZHIPIN_FRONTEND_IMAGE = $(REGISTRY)/$(ZHIPIN_FRONTEND_REPO):$(PKG_VERSION)
ZHIPIN_SERVER_IMAGE = $(REGISTRY)/$(ZHIPIN_SERVER_REPO):$(PKG_VERSION)

all: build push clean
frontend: buildfrontend pushfrontend cleanfrontend
server: buildserver pushserver cleanserver

build: buildfrontend buildserver

push: pushfrontend pushserver

clean: cleanfrontend cleanserver

buildfrontend:
	@echo "Building zhipin-frontend image: $(ZHIPIN_FRONTEND_IMAGE)"
	sudo docker build -t $(ZHIPIN_FRONTEND_IMAGE) -f frontend/Dockerfile .

pushfrontend:
	@echo "Pushing zhipin-frontend image: $(ZHIPIN_FRONTEND_IMAGE)"
	sudo docker push $(ZHIPIN_FRONTEND_IMAGE)

cleanfrontend:
	@echo "Cleaning up local zhipin-frontend image"
	-sudo docker rmi $(ZHIPIN_FRONTEND_IMAGE)

buildserver:
	@echo "Building zhipin-server image: $(ZHIPIN_SERVER_IMAGE)"
	sudo docker build --build-arg AUTO_MIGRATE_DATABASE=$(AUTO_MIGRATE_DATABASE) --build-arg ALLOW_EMPTY_DATABASE_BOOTSTRAP=$(ALLOW_EMPTY_DATABASE_BOOTSTRAP) --build-arg ALLOW_INSECURE_SIT_STARTUP=$(ALLOW_INSECURE_SIT_STARTUP) --build-arg SECURITY_HEADERS_ENABLED=$(SECURITY_HEADERS_ENABLED) --build-arg RATE_LIMIT_ENABLED=$(RATE_LIMIT_ENABLED) --build-arg ALLOW_PUBLIC_REGISTRATION=$(ALLOW_PUBLIC_REGISTRATION) -t $(ZHIPIN_SERVER_IMAGE) -f backend/Dockerfile .

pushserver:
	@echo "Pushing zhipin-server image: $(ZHIPIN_SERVER_IMAGE)"
	sudo docker push $(ZHIPIN_SERVER_IMAGE)

cleanserver:
	@echo "Cleaning up local zhipin-server image"
	-sudo docker rmi $(ZHIPIN_SERVER_IMAGE)
