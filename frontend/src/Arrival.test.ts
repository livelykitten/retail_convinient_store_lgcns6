import { describe, expect, it } from 'vitest';
import { appLink, appLinks } from './Arrival';
import type { Plan } from './ledgerData';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

describe('appLink', () => {
    it('Android는 intent로 열고 설치 안 됐으면 Play 스토어로 보낸다', () => {
        const link = appLink('TELECOM', 'SKT', ANDROID);
        expect(link?.name).toBe('T 멤버십');
        expect(link?.href).toBe('intent://#Intent;package=com.tms;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.tms;end');
        expect(appLink('PAY', 'KAKAOPAY', ANDROID)?.href).toContain('package=com.kakaopay.app;');
    });
    it('iOS는 App Store 페이지, 앱 ID를 모르면 버튼을 내지 않는다', () => {
        expect(appLink('TELECOM', 'KT', IPHONE)?.href).toBe('https://apps.apple.com/kr/app/id451095024');
        expect(appLink('TELECOM', 'LGU', IPHONE)).toBeNull();
        expect(appLink('PAY', 'TOSSPAY', IPHONE)).toBeNull();
    });
    it('PC는 Play 스토어 웹 페이지', () => {
        expect(appLink('TELECOM', 'LGU', PC)?.href).toBe('https://play.google.com/store/apps/details?id=com.lguplus.mobile.cs');
    });
    it('카드 · 편의점 멤버십 · 모르는 코드는 버튼 없음', () => {
        expect(appLink('CARD', 'shinhan-mrlife', ANDROID)).toBeNull();
        expect(appLink('MEMBERSHIP', 'GS25', ANDROID)).toBeNull();
        expect(appLink('TELECOM', 'XYZ', ANDROID)).toBeNull();
    });
});

describe('appLinks', () => {
    it('통신사 멤버십을 먼저, 그다음 간편결제. 카드는 빠진다', () => {
        const plan = { methods: [
            { kind: 'PAY', code: 'NAVERPAY', label: '네이버페이', amount: 0 },
            { kind: 'CARD', code: 'shinhan-mrlife', label: '신한카드 Mr.Life', amount: 190 },
            { kind: 'TELECOM', code: 'KT', label: 'KT 멤버십', amount: 200 }
        ] } as unknown as Plan;
        expect(appLinks(plan, ANDROID).map(app => app.name)).toEqual(['KT 멤버십', '네이버페이']);
    });
});
