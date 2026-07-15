package middleware

import (
	"github.com/dlxyz/SubioHub/internal/service"

	"github.com/gin-gonic/gin"
)

// AgentConsoleOnly 允许 admin、channel_partner、agent 或 distributor 访问营销后台接口
// 必须在 JWTAuth 中间件之后使用
func AgentConsoleOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, ok := GetUserRoleFromContext(c)
		if !ok {
			AbortWithError(c, 401, "UNAUTHORIZED", "User not found in context")
			return
		}

		if role != service.RoleAdmin &&
			role != service.RoleChannelPartner &&
			role != service.RoleAgent &&
			role != service.RoleDistributor {
			AbortWithError(c, 403, "FORBIDDEN", "Agent console access required")
			return
		}

		c.Next()
	}
}
