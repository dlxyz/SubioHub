package service

import (
	"crypto/rand"
	"strings"
)

const inviteCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const inviteCodeLength = 8

// NewInviteCode generates a short uppercase invite code for affiliate sharing.
func NewInviteCode() (string, error) {
	var builder strings.Builder
	builder.Grow(inviteCodeLength)
	limit := byte(len(inviteCodeAlphabet))
	buf := make([]byte, inviteCodeLength)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for _, b := range buf {
		builder.WriteByte(inviteCodeAlphabet[int(b)%int(limit)])
	}
	return builder.String(), nil
}
