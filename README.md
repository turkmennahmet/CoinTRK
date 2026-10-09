# CoinTRK

Binance Futures ve Binance Alpha (Web3) tokenleri için teknik tarayıcı: RSI, hareketli ortalama kesişimleri, hacim anomalileri, RSI uyumsuzlukları, open interest ve funding oranları tek yerde.

**Canlı site:** (http://coin-trk.vercel.app/)

<!-- Ekran görüntüsü: docs/screenshot.png dosyasını ekleyip alttaki satırı aç -->
<!-- ![CoinTRK](docs/screenshot.png) -->

## Özellikler

- **Hacim:** Son kapanan mumun hacmini önceki 50 mumun ortalamasıyla karşılaştırır.
- **Fiyat-Hacim:** Olağan dışı mumları sınıflandırır: hacimli kırılım, absorpsiyon (yüksek hacim, küçük hareket), hacim patlaması ve ince hareket (düşük hacimle büyük hareket).
- **RSI:** Wilder RSI(14) ve seçilebilir RSI aralığı filtresi.
- **Uyumsuzluk:** Fiyat ile RSI arasındaki pozitif/negatif uyumsuzluklar.
- **Golden Cross / EMA:** SMA ve EMA 50/200 kesişimleri ve kaç mum önce gerçekleştikleri.
- **Birleşik Filtre:** Tüm metrikleri tek tabloda birlikte filtreleme.
- **Open Interest:** Open interest değişimi ile fiyat değişiminin karşılaştırması.
- **Funding:** Tüm USDT perpetual kontratlarının güncel funding oranları.
- **Coin detayı:** Tek bir coinin tüm metrikleri, tüm zaman dilimlerinde.
- **Web3 Alpha:** Binance Alpha tokenleri için Hacim, RSI ve Fiyat-Hacim sayfaları.

Zaman dilimleri 15 dakikadan 1 haftaya kadar seçilebilir. Filtreler adres çubuğunda tutulur, bu yüzden filtrelenmiş bir görünümün linki paylaşılabilir.

## Nasıl çalışır

- **Front-end:** React, Vite ve TanStack Query. Veriler arka planda düzenli olarak yenilenir.
- **Backendç:** FastAPI, Vercel üzerinde serverless fonksiyon olarak çalışır.
- **Veri:** Binance Futures API. 24 saatlik hacme göre en likit 400 coin taranır (ayarlanabilir).
- **Önbellek:** Taramalar önbellekte tutulur. Süresi dolan veri hemen sunulurken arka planda yenilenir. Kapanmış mumlar tekrar indirilmez; her yenilemede yalnızca yeni mumlar çekilir.

Grafik araçlarıyla tutarlı değerler için yalnızca **kapanmış mumlar** kullanılır; oluşmakta olan son mum hesaba katılmaz.

## Yerel kurulum

Gereksinimler: **Python 3.12+** ve **Node.js 20+**

### Back-end

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

### Front-end

Ayrı bir terminalde:

```bash
cd frontend
npm ci
npm run dev
```




> Binance her dakika için 2400 istek ağırlığı sınırı uygular ve her coin taraması 2 ağırlık harcar. Tarama boyutlarını büyütürken bu sınırı göz önünde bulundurun.


> ⚠️ **Vercel deploy için Fonksiyon bölgesi `fra1` olarak kalmalıdır.** Binance bazı bölgelerden (örneğin ABD) gelen istekleri engeller. Bölge değiştirilirse API "bölge engeli" hatası döner.


