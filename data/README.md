# 鯖江市オープンデータ

このフォルダには、オープンデータプラットフォームから取得した福井県鯖江市の実データを保存しています。ライセンスはCC BY 2.1です。

- `public_toilets.csv` 公共トイレ：44件
- `parking.csv` 駐車場：10件
- `bus_stops.csv` バス停：293件
- `red_pandas.csv` 西山動物園のレッサーパンダ一覧：12件
- `red_panda_individuals.xlsx` レッサーパンダ飼育個体情報：68件
- `visitor_flow_2025.csv` 令和7年度 西山公園入場者 市区町村別割合：16件
- `open-data.raw.json` アプリ読込用に変換した元列保持JSON

取得元URL、用途、更新日、件数はルートの`OPEN_DATA_SOURCES.md`に記録しています。CSVの一部はShift_JIS配布だったためUTF-8へ変換していますが、値と列名は保持しています。`scripts/build_open_data.py`を実行すると、CSV/XLSXから`open-data.raw.json`を再生成できます。

列名の正規化と古い度分秒形式の座標変換は`lib/data-loader.ts`が担当します。架空地点は使用していません。
