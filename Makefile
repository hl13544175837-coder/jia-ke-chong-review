.PHONY: build push clean all frontend server buildfrontend pushfrontend cleanfrontend buildserver pushserver cleanserver

# Environment variables that can be overridden by GitLab CI
PKG_TAG ?= RC
PKG_VERSION ?= $(shell date +%Y%m%d%H%M)
VITE_DEFAULT_ROLE ?= recruiter
VITE_GATEWAY_ROLE_MAP ?=
AUTH_GATEWAY_USER_ROLE ?= recruiter
AUTH_GATEWAY_ROLE_MAP ?=
SIT_GATEWAY_ROLE_MAP := 100000:interviewer,100001:manager,100002:recruiter,100003:interviewer
BUILD_VERSION ?= $(shell git rev-parse --short=12 HEAD)
BUILD_TIME ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)

ifeq ($(strip $(PKG_TAG)),)
	override PKG_TAG := RC
endif

ifeq ($(strip $(PKG_VERSION)),)
	override PKG_VERSION := $(shell date +%Y%m%d%H%M)
endif

# Release policy is derived from the validated package tag and cannot be
# replaced by a command-line variable assignment.
override RELEASE_CHANNEL := $(PKG_TAG)
override BUILD_CHANNEL := $(PKG_TAG)

# Determine registry based on PKG_TAG
ifeq ($(PKG_TAG),GA)
	override REGISTRY := registry.ymdd.tech
	override VITE_GATEWAY_ROLE_MAP :=
	override AUTH_GATEWAY_ROLE_MAP :=
	override AUTO_MIGRATE_DATABASE := false
	override ALLOW_EMPTY_DATABASE_BOOTSTRAP := false
	override ALLOW_INSECURE_SIT_STARTUP := false
	override SECURITY_HEADERS_ENABLED := true
	override RATE_LIMIT_ENABLED := true
	override ALLOW_PUBLIC_REGISTRATION := false
	override RESUME_AI_ENABLED := true
else ifeq ($(PKG_TAG),RC)
	override REGISTRY := registry-sit.uce.cn
	override VITE_GATEWAY_ROLE_MAP := $(SIT_GATEWAY_ROLE_MAP)
	override AUTH_GATEWAY_USER_ROLE := recruiter
	override AUTH_GATEWAY_ROLE_MAP := $(SIT_GATEWAY_ROLE_MAP)
	override AUTO_MIGRATE_DATABASE := true
	override ALLOW_EMPTY_DATABASE_BOOTSTRAP := true
	override ALLOW_INSECURE_SIT_STARTUP := true
	override SECURITY_HEADERS_ENABLED := false
	override RATE_LIMIT_ENABLED := false
	override ALLOW_PUBLIC_REGISTRATION := true
	override RESUME_AI_ENABLED := false
else
$(error PKG_TAG must be exactly RC or GA, got '$(PKG_TAG)')
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
	sudo docker build --build-arg VITE_DEFAULT_ROLE=$(VITE_DEFAULT_ROLE) --build-arg VITE_GATEWAY_ROLE_MAP="$(VITE_GATEWAY_ROLE_MAP)" --build-arg BUILD_VERSION=$(BUILD_VERSION) --build-arg BUILD_CHANNEL=$(BUILD_CHANNEL) --build-arg BUILD_TIME=$(BUILD_TIME) -t $(ZHIPIN_FRONTEND_IMAGE) -f readdy-frontend/Dockerfile .

pushfrontend:
	@echo "Pushing zhipin-frontend image: $(ZHIPIN_FRONTEND_IMAGE)"
	sudo docker push $(ZHIPIN_FRONTEND_IMAGE)

cleanfrontend:
	@echo "Cleaning up local zhipin-frontend image"
	-sudo docker rmi $(ZHIPIN_FRONTEND_IMAGE)

buildserver:
	@echo "Building zhipin-server image: $(ZHIPIN_SERVER_IMAGE)"
	sudo docker build --build-arg RELEASE_CHANNEL=$(RELEASE_CHANNEL) --build-arg AUTO_MIGRATE_DATABASE=$(AUTO_MIGRATE_DATABASE) --build-arg ALLOW_EMPTY_DATABASE_BOOTSTRAP=$(ALLOW_EMPTY_DATABASE_BOOTSTRAP) --build-arg ALLOW_INSECURE_SIT_STARTUP=$(ALLOW_INSECURE_SIT_STARTUP) --build-arg SECURITY_HEADERS_ENABLED=$(SECURITY_HEADERS_ENABLED) --build-arg RATE_LIMIT_ENABLED=$(RATE_LIMIT_ENABLED) --build-arg ALLOW_PUBLIC_REGISTRATION=$(ALLOW_PUBLIC_REGISTRATION) --build-arg RESUME_AI_ENABLED=$(RESUME_AI_ENABLED) --build-arg AUTH_GATEWAY_USER_ROLE=$(AUTH_GATEWAY_USER_ROLE) --build-arg AUTH_GATEWAY_ROLE_MAP="$(AUTH_GATEWAY_ROLE_MAP)" --build-arg BUILD_VERSION=$(BUILD_VERSION) --build-arg BUILD_CHANNEL=$(BUILD_CHANNEL) --build-arg BUILD_TIME=$(BUILD_TIME) -t $(ZHIPIN_SERVER_IMAGE) -f backend/Dockerfile .

pushserver:
	@echo "Pushing zhipin-server image: $(ZHIPIN_SERVER_IMAGE)"
	sudo docker push $(ZHIPIN_SERVER_IMAGE)

cleanserver:
	@echo "Cleaning up local zhipin-server image"
	-sudo docker rmi $(ZHIPIN_SERVER_IMAGE)
