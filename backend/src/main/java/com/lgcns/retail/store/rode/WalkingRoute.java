package com.lgcns.retail.store.rode;

import java.util.List;

public record WalkingRoute(
        int distanceM,
        int durationSeconds,
        List<Coordinate> path,
        String landingUrl) {
}
