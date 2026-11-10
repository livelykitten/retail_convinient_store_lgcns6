"""Small offline regression suite: API shapes, identities and DB constraints."""
import csv
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import collect_catalog as c
from catalog_normalization import normalize_name


def search_payload(collection, fields):
    return {'SearchQueryResult': {'Collection': [dict(CollectionId=collection,
        Documentset={'Document': [{'field': f} for f in fields]})]}}


class CatalogTest(unittest.TestCase):
    def test_relocated_reference_and_schema_paths_exist(self):
        self.assertTrue((c.REPO_ROOT / 'backend/src/main/resources/schema.sql').is_file())
        self.assertTrue((c.REFERENCE_OUTPUT / 'category_audit_output/product_samples.csv').is_file())
        self.assertTrue((c.REFERENCE_OUTPUT / 'seven_csv_output/products.csv').is_file())
        self.assertTrue(c.NAME_REPORT.is_file())
        self.assertEqual(c.ARTIFACT_ROOT.parent, c.REPO_ROOT)

    def row(self, brand='SEVEN', code='8801', name='코카)코카콜라제로500ML', amount=2600, event=''):
        if brand == 'SEVEN':
            cats = ('탄산음료', '', '')
        elif brand == 'GS25':
            cats = ('음료', '탄산음료', '콜라')
        elif brand == 'EMART24':
            cats = ('탄산음료', '탄산음료(소)', '')
        else:
            cats = ('메뉴:60', '', '')
        return c.record(brand, code, name, amount, event, *cats)

    def test_name_rules(self):
        names = ['칠성)펩시콜라1ㆍ5L', '롯데칠성)펩시콜라1500ML', '롯데 펩시콜라1.5P']
        normalized = [normalize_name(s) for s in names]
        self.assertEqual(len({r[2] for r in normalized}), 1)
        self.assertEqual(normalized[0][3:], (1500, 'ML'))
        self.assertEqual(normalize_name('서울)흰우유P500')[3:], (500, 'ML'))
        self.assertEqual(normalize_name('비알)우유２５０ml[D2]')[1], '배스킨라빈스')
        self.assertEqual(normalize_name('영진)제육도시락', 'LUNCHBOX')[1], '')
        self.assertEqual(normalize_name('삼)참치마요2편', 'TRIANGLE_KIMBAP')[0], '참치마요')
        self.assertNotEqual(normalize_name('농심)신라면소컵')[2], normalize_name('농심)신라면큰컵')[2])
        self.assertNotEqual(normalize_name('농심)신라면120g4입')[2], normalize_name('농심)신라면120g6입')[2])
        self.assertEqual(normalize_name('남양)우유100ml+50ml')[3:], (None, None))

    def test_event_codes_and_gifts(self):
        for code in ('0+1', '1+0', '2+0', '3+0', '세일'):
            self.assertEqual(c.event(code), 'OTHER')
        self.assertEqual(c.event('3+1'), 'THREE_PLUS_ONE')
        self.assertNotEqual(c.event('0+1'), c.event(''))
        rows = [self.row(code='gift', name='M_증정)콜라500ml'), self.row(code='normal', name='코카)코카콜라제로500ml키링증정')]
        _, products, reports = c.integrate(rows)
        self.assertEqual(len(products), 1)
        self.assertEqual(len(reports['excluded_items']), 1)

    def test_native_api_shapes(self):
        fields = dict(itemCd='seven1', itemOnm='서울)흰우유1L', onlinePrice='2800', evnMnmNm='1+1', dispClassNm='우유')
        self.assertEqual(c.parse_seven(search_payload('offline', [fields]))[0]['event'], 'ONE_PLUS_ONE')
        gs = search_payload('offlineItem', [dict(itemCode='g1', itemName='코카콜라500ML', sellPrice='2600', dptNm='음료', lineNm='탄산음료', clssNm='콜라')])
        gs['SearchQueryResult']['Collection'] += search_payload('oneplus', [dict(itemCode='g1', itemName='코카콜라500ML', sellPrice='2600', tag='1')])['SearchQueryResult']['Collection']
        rows, promos = c.parse_gs25(gs)
        self.assertEqual(rows[0]['event'], 'OTHER')
        self.assertEqual(promos[0]['event'], 'ONE_PLUS_ONE')
        em = {'productList': [dict(pluCd='e1', goodsNm='코카)코카콜라500ml', viewPrice=2200, originPrice=2600, salePrice=-400, title='세일')]}
        self.assertEqual(c.parse_emart24(em)[0]['price'], 2600)
        del em['productList'][0]['title']
        self.assertEqual(c.parse_emart24(em)[0]['event'], 'NONE')
        content = '''<li class="prod_list"><div onclick="view(123)"><img src="//img.example/p/8801.jpg"></div>
            <div class="name"><p>서울)흰우유1L</p></div><div class="price"><strong>2,800</strong></div>
            <div class="badge"><!-- plus2 : 2+1 --><span class="plus1">1+1</span></div></li>'''
        cu = c.parse_cu(content, dict(searchMainCategory='60'))
        self.assertEqual(cu[0]['source_code'], 'view-123')
        self.assertEqual(cu[0]['event'], 'ONE_PLUS_ONE')
        self.assertEqual(c.parse_cu('<p id="nothing">조회된 상품이 없습니다</p>', {}), [])

    def test_paging_and_one_brand_failure_preserve_other_data(self):
        import json
        calls = []
        def response(brand, payload, **_kwargs):
            calls.append((brand, payload))
            if brand == 'seven':
                raise c.audit.HttpStatusError(403, 'test', 'forbidden')
            if brand == 'gs25':
                fields = [] if payload['startCount'] else [dict(itemCode='g1', itemName='코카콜라500ML', sellPrice='2600', dptNm='음료', lineNm='탄산음료', clssNm='콜라')]
                data = search_payload('offlineItem', fields)
                data['SearchQueryResult']['Collection'] += search_payload('oneplus', [])['SearchQueryResult']['Collection']
                return json.dumps(data).encode()
            return b'{"productList": []}'
        args = SimpleNamespace(input_jsonl=None, timeout=1, delay=1, max_requests=20,
            brands=['SEVEN', 'GS25', 'EMART24'], queries=['콜라'], max_pages=3)
        with tempfile.TemporaryDirectory() as temp, patch.object(c.audit.Client, 'post', side_effect=response):
            rows, reports = c.gather(Path(temp), args)
        self.assertEqual(reports['SEVEN']['status'], 'failed')
        self.assertEqual([p['startCount'] for b, p in calls if b == 'gs25'], [0, 50])
        self.assertEqual(reports['GS25']['status'], 'success')
        self.assertEqual(len(rows), 1)

    def test_cross_brand_merge_conflicts_and_db(self):
        rows = [self.row(b, b) for b in c.BRANDS]
        rows += [self.row('SEVEN', 'different-barcode'), self.row('CU', 'bad-price', amount=2800)]
        groups, products, reports = c.integrate(rows)
        self.assertEqual(len(groups), 1)
        self.assertEqual({r['brand'] for r in products}, {'SEVEN', 'GS25', 'EMART24'})
        self.assertEqual({r['brand'] for r in reports['sku_conflicts']}, {'CU'})
        c.validate_output(groups, products, c.REPO_ROOT / 'backend/src/main/resources/schema.sql')
        # Same barcode with a different product must not force a merge or duplicate product_id.
        rows = [self.row(), self.row(name='코카)코카콜라제로레몬500ml')]
        groups, products, _ = c.integrate(rows)
        self.assertEqual(len(groups), 2)
        self.assertEqual(len({r['product_id'] for r in products}), 2)
        # Different event, even OTHER vs NONE, withholds the whole brand/product.
        self.assertEqual(c.integrate([self.row(), self.row(code='other', event='0+1')])[1], [])

    def test_category_recovery_and_false_positives(self):
        tea = self.row('GS25', 'tea', name='보리차500ml')
        tea.update(c1='음료', c2='커피/차음료', c3='차음료-페트')
        self.assertEqual(c.source_category(tea), '')
        cold_coffee = self.row('GS25', 'coffee', name='매일)바리스타325ml')
        cold_coffee.update(c1='유제품', c2='우유', c3='냉장커피')
        self.assertEqual(c.source_category(cold_coffee), 'COFFEE')
        seven = self.row()
        missing = self.row('CU', 'cu1')
        missing.update(c1='', c2='', c3='')
        groups, products, _ = c.integrate([seven, missing])
        self.assertEqual(len(products), 2)
        self.assertEqual(groups[0]['category'], 'COLA')
        for name in ('콜라맛젤리500g', '도시락김', '라면과자'):
            _, products, reports = c.integrate([self.row('CU', name, name=name)])
            self.assertFalse(products)
            self.assertEqual(len(reports['unmapped_products']), 1)
        wrong_category = self.row()
        wrong_category.update(c1='커피음료')
        _, products, reports = c.integrate([self.row(), wrong_category])
        self.assertFalse(products)
        self.assertEqual(len(reports['sku_conflicts']), 2)

    def test_reference_is_audit_not_forced_alias(self):
        with tempfile.TemporaryDirectory() as temp:
            ref = Path(temp) / 'names.csv'
            c.seven.write_csv(ref, ['name', 'candidates'], [dict(name='이전 결과', candidates='SEVEN:코카)코카콜라제로500ML')])
            groups, _, reports = c.integrate([self.row()], names=ref)
            self.assertNotEqual(groups[0]['name'], '이전 결과')
            self.assertEqual(len(reports['normalization_changes']), 1)
            buffer = io.StringIO(newline='')
            csv.writer(buffer).writerow(['쉼표,포함', '따옴표"포함'])
            self.assertEqual(next(csv.reader(io.StringIO(buffer.getvalue()))), ['쉼표,포함', '따옴표"포함'])


if __name__ == '__main__':
    unittest.main()
