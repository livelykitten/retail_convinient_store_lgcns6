package com.lgcns.retail.store.rode;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.lgcns.retail.store.rode.KakaoWalkingClient.Leg;
import com.lgcns.retail.store.rode.KakaoWalkingClient.Route;
import com.lgcns.retail.store.rode.KakaoWalkingClient.Step;
import com.lgcns.retail.store.rode.KakaoWalkingClient.WalkResponse;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class WalkingRouteService {

    private final KakaoWalkingClient kakaoWalkingClient;

    public WalkingRoute findRoute(double startX, double startY, double endX, double endY) {
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
    }
}
