# 중남미 뉴스 현황판 (latam-news-board)

사이넥스 헬스케어혁신연구소 · 멕시코·중미·남미 20개국의 최근 7일 뉴스를 지도 위에 보여주는 현황판입니다.

- 주소: https://super-domingo.github.io/latam-news-board/
- 갱신: 매일 07:00 · 13:00 (KST), Claude 예약 작업이 `UPDATE_GUIDE.md` 지침대로 `data/`를 갱신
- 주제: 정세 · 정치·사회 · 보건의료 / 중요도 3단계(빨강 즉시 확인 · 주황 주의 · 회색 참고)
- 파라과이(지사) 전용 영역: 뉴스 상세, 보건·규제 동향(DINAVISA·MSPBS 등), 환율·경제 지표

## 구성
| 경로 | 내용 |
|---|---|
| `index.html`, `assets/` | 화면 (Leaflet 지도, 순환 뉴스 카드, 파라과이 패널) |
| `data/news.json` | 20개국 뉴스 (최근 7일) |
| `data/paraguay.json` | 파라과이 보건·규제 동향(30일), 경제 지표 |
| `scripts/merge_news.py` | 새 뉴스 병합·중복 제거·기간 정리·형식 검사 |
| `UPDATE_GUIDE.md` | 예약 작업용 수집 지침 |

환율은 화면에서 ExchangeRate-API(open.er-api.com)로 실시간 조회합니다.
지도 경계: johan/world.geo.json (Natural Earth 기반).
