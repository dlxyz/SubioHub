package main

import (
	"context"
	"fmt"
	"log"

	"github.com/dlxyz/SubioHub/ent"
	_ "github.com/lib/pq"
)

func main() {
	client, err := ent.Open("postgres", "postgres://postgres:password@localhost:5432/subiohub?sslmode=disable", ent.Debug())
	if err != nil {
		log.Fatalf("failed opening connection to postgres: %v", err)
	}
	defer client.Close()
	// Run the auto migration tool.
	if err := client.Schema.Create(context.Background()); err != nil {
		log.Fatalf("failed creating schema resources: %v", err)
	}
	fmt.Println("Migration successful")
}
