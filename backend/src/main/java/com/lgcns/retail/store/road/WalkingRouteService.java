package com.lgcns.retail.store.road;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.lgcns.retail.store.road.KakaoWalkingClient.Leg;
import com.lgcns.retail.store.road.KakaoWalkingClient.Route;
import com.lgcns.retail.store.road.KakaoWalkingClient.Step;
import com.lgcns.retail.store.road.KakaoWalkingClient.WalkResponse;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class WalkingRouteService {
    private static final int MAX_DISTANCE_M = 2000;
    private static final double EARTH_RADIUS_M = 6_371_000;
    private final KakaoWalkingClient kakaoWalkingClient;

    public WalkingRoute findRoute(double startX, double startY, double endX, double endY) {
    if (straightDistanceM(startX, startY, endX, endY) > MAX_DISTANCE_M) {
        throw new RouteTooFarException();
    }

    WalkResponse response = kakaoWalkingClient.findRoute(startX, startY, endX, endY);
   
        if ("SAME_POINT".equals(response.status())) {
            return new WalkingRoute(0, 0, List.of(), null);
        }
        if (!"OK".equals(response.status()) || response.route() == null) {
            throw new RouteNotFoundException();
        }

        Route route = response.route();
        return new WalkingRoute(
                route.properties().totalDistance(),
                route.properties().totalTime(),
                toPath(route),
                route.properties().landingUrl());
    }

    private static List<Coordinate> toPath(Route route) {
        List<Coordinate> path = new ArrayList<>();
        for (Leg leg : route.legs()) {
            for (Step step : leg.steps()) {
                if (step.path() == null) {
                    continue;
                }
                for (double[] point : step.path().points()) {
                    Coordinate coordinate = new Coordinate(point[0], point[1]);
                    // 구간이 이어지는 점은 앞 구간의 끝과 같으므로 한 번만 넣는다.
                    if (path.isEmpty() || !path.get(path.size() - 1).equals(coordinate)) {
                        path.add(coordinate);
                    }
                }
            }
        }
        return path;
    }   // ← 61번째 줄, toPath 끝

    /** 두 좌표 사이의 직선거리(m). x는 경도, y는 위도. */
    static double straightDistanceM(double startX, double startY, double endX, double endY) {
        double dLat = Math.toRadians(endY - startY);
        double dLng = Math.toRadians(endX - startX);
        double a = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(startY)) * Math.cos(Math.toRadians(endY))
                * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
    }
    
}
