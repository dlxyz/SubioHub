.PHONY: build build-backend build-web build-frontend build-datamanagementd test test-backend test-web test-frontend test-datamanagementd secret-scan

# 一键编译前后端
build: build-backend build-web

# 编译后端（复用 backend/Makefile）
build-backend:
	@$(MAKE) -C backend build

# 编译 Web 应用
build-web:
	@npm --prefix next-web run build

# 兼容旧目标名
build-frontend: build-web

# 编译 datamanagementd（宿主机数据管理进程）
build-datamanagementd:
	@cd datamanagement && go build -o datamanagementd ./cmd/datamanagementd

# 运行测试（后端 + Web）
test: test-backend test-web

test-backend:
	@$(MAKE) -C backend test

test-web:
	@cd next-web && npm run lint && npx tsc --noEmit

# 兼容旧目标名
test-frontend: test-web

test-datamanagementd:
	@cd datamanagement && go test ./...

secret-scan:
	@python3 tools/secret_scan.py
