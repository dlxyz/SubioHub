package routes

import (
	"github.com/dlxyz/SubioHub/internal/handler"
	"github.com/dlxyz/SubioHub/internal/server/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterAgentRoutes 注册代理后台路由
func RegisterAgentRoutes(
	v1 *gin.RouterGroup,
	h *handler.Handlers,
	jwtAuth middleware.JWTAuthMiddleware,
) {
	agent := v1.Group("/agent")
	agent.Use(gin.HandlerFunc(jwtAuth))
	agent.Use(middleware.AgentConsoleOnly())
	{
		registerProxyRoutes(agent, h)
		registerChannelRoutes(agent, h)
		registerAffiliateRoutes(agent, h)
		distributors := agent.Group("/distributors")
		{
			distributors.GET("", h.Affiliate.ListDistributors)
			distributors.POST("", h.Affiliate.CreateDistributor)
			distributors.POST("/:id/rate", h.Affiliate.SetDistributorRate)
			distributors.PUT("/:id/status", h.Affiliate.UpdateDistributorStatus)
		}
	}
}
