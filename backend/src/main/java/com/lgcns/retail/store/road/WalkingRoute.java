package com.lgcns.retail.store.road;

import java.util.List;

public record WalkingRoute(
        int distanceM,
        int durationSeconds,
        List<Coordinate> path,
        String landingUrl) {
}
