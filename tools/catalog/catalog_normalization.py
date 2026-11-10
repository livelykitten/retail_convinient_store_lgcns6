"""Team naming rules v1.0. Names, never barcodes, define product identity."""
from decimal import Decimal
import re
import unicodedata

from final_seven_collector import MAKER_ALIASES, NON_MAKERS

KNOWN_MAKERS = ('코카콜라', '롯데칠성', '배스킨라빈스', '서울우유', '빙그레', '남양', '매일',
                '농심', '오뚜기', '삼양', '팔도', '하림', '동원', '풀무원', '해태', '롯데', '칠성')
SIZE = re.compile(r'(?<![\d.])(\d+(?:\.\d+)?)\s*(ml|kg|l|g)(?![a-z])', re.I)


def normalize_name(raw: str, category: str = '') -> tuple[str, str, str, int | None, str | None]:
    s = unicodedata.normalize('NFKC', raw)
    s = re.sub(r'(?<=\d)[ㆍ·ᆞ](?=\d)', '.', s).replace('_', ' ')
    s = re.sub(r'\[D\d+\]', '', s, flags=re.I)
    s = re.sub(r'\d+편(?=$|\s|\))', '', s)
    s = re.sub(r'PET|펫', '', s, flags=re.I)
    s = re.sub(r'(?<![a-z])P(\d+(?:\.\d+)?)', r'\1ml', s, flags=re.I)
    s = re.sub(r'(\d+\.\d+)P(?![a-z])', r'\1L', s, flags=re.I)
    # Preserve flavor/variant parentheses; only repair unmatched parentheses.
    if s.count('(') > s.count(')'):
        s += ')' * (s.count('(') - s.count(')'))
    maker = ''
    prefix = re.match(r'^\s*([^()]{1,22})[):]\s*(.*)$', s)
    fresh = category in ('LUNCHBOX', 'TRIANGLE_KIMBAP')
    if prefix:
        token, s = prefix.groups()
        token = token.strip()
        if not fresh and token.replace(' ', '').upper() not in NON_MAKERS | {'해외', '앱', '앱예약'}:
            maker = MAKER_ALIASES.get(token, token)
    else:
        for token in KNOWN_MAKERS:
            if s.startswith(token):
                maker = MAKER_ALIASES.get(token, token)
                s = s[len(token):].lstrip()
                break
    if fresh:
        maker = ''
        s = re.sub(r'^(?:영진|대정)[)\s]+', '', s)
    # Small / large / bag are distinguishing attributes. Do not erase 큰사발.
    s = re.sub(r'작은컵|소용기|소컵면', '소컵', s)
    s = re.sub(r'대용기|왕컵|대컵', '큰컵', s)
    s = re.sub(r'봉지라면', '라면봉지', s)
    s = re.sub(r'라면봉(?!지)', '라면봉지', s)
    s = re.sub(r'\(\s*(소컵|큰컵|봉지)\s*\)', r'\1', s)
    s = re.sub(r'(?<!\d)(\d+)\s*입', r'\1입', s)
    matches = list(SIZE.finditer(s))
    size = unit = None
    if len(matches) == 1:
        match = matches[0]
        amount = Decimal(match[1]) * (1000 if match[2].lower() in ('l', 'kg') else 1)
        if amount.is_finite() and 0 < amount <= 2147483647 and amount == amount.to_integral_value():
            size = int(amount)
            unit = 'ML' if match[2].lower() in ('ml', 'l') else 'G'
            capacity = (f'{Decimal(size) / 1000:g}L' if unit == 'ML' and size >= 1000 else
                        f'{size}{"ml" if unit == "ML" else "g"}')
            s = s[:match.start()] + ' ' + s[match.end():]
            bundles = re.findall(r'\d+입', s)
            s = re.sub(r'\d+입', '', s)
            s = s.strip() + ' ' + capacity + (' ' + ' '.join(bundles) if bundles else '')
    # A duplicate maker prefix adds no identifying information.
    if maker:
        for alias in sorted({maker} | {key for key, value in MAKER_ALIASES.items() if value == maker}, key=len, reverse=True):
            if s.startswith(alias) and (alias == maker or re.match(re.escape(alias) + r'(?:\s|\))', s)):
                s = s[len(alias):].lstrip(' )')
                break
    s = re.sub(r'\(\s*\)', '', s)
    s = re.sub(r'\s+', ' ', s).strip(' )')
    name = (maker + ' ' if maker else '') + s
    identity = re.sub(r'\s+', '', name).casefold()
    return name, maker, identity, size, unit
