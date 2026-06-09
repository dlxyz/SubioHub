package service

import (
	"errors"
	"testing"
	"time"

	"github.com/zeromicro/go-zero/core/collection"
)

func TestProvideTimingWheelService_ReturnsError(t *testing.T) {
	original := newTimingWheel
	t.Cleanup(func() { newTimingWheel = original })

	newTimingWheel = func(_ time.Duration, _ int, _ collection.Execute) (*collection.TimingWheel, error) {
		return nil, errors.New("boom")
	}

	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("期望发生 panic，但没有 panic")
		}
	}()

	_ = ProvideTimingWheelService()
}

func TestProvideTimingWheelService_Success(t *testing.T) {
	svc := ProvideTimingWheelService()
	if svc == nil {
		t.Fatalf("期望 svc 非空，但得到 nil")
	}
	svc.Stop()
}
