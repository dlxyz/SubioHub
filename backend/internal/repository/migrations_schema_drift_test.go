package repository

import (
	"io/fs"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/dlxyz/SubioHub/migrations"
	"github.com/stretchr/testify/require"
)

// TestEntTablesHaveMigrations 防止 Ent schema 与 SQL 迁移再次漂移：
// 每个 ent.Table 注解声明的表，都必须在 migrations 中存在 CREATE TABLE 语句。
func TestEntTablesHaveMigrations(t *testing.T) {
	schemaDir := os.DirFS("../../ent/schema")
	schemaFiles, err := fs.Glob(schemaDir, "*.go")
	require.NoError(t, err)
	require.NotEmpty(t, schemaFiles)

	migrationSQL := readAllMigrations(t)

	tablePattern := regexp.MustCompile(`Table:\s*"([a-zA-Z0-9_]+)"`)
	found := 0
	for _, name := range schemaFiles {
		content, err := fs.ReadFile(schemaDir, name)
		require.NoError(t, err)
		matches := tablePattern.FindAllStringSubmatch(string(content), -1)
		for _, match := range matches {
			table := match[1]
			found++
			needle := "CREATE TABLE IF NOT EXISTS " + table
			require.Containsf(t, migrationSQL, needle, "table %q is defined in ent schema but missing migration", table)
		}
	}
	require.NotZero(t, found, "no ent table annotations found")
}

func readAllMigrations(t *testing.T) string {
	t.Helper()
	files, err := fs.Glob(migrations.FS, "*.sql")
	require.NoError(t, err)
	var builder strings.Builder
	for _, name := range files {
		content, err := fs.ReadFile(migrations.FS, name)
		require.NoError(t, err)
		builder.Write(content)
		builder.WriteString("\n")
	}
	return builder.String()
}
