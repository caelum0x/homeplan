# HomePlan - Maket.ai ve ARCHITEChTURES karşılaştırması: mimarlar ve müteahhitler için gerçek, dürüst bir inceleme

**Hedef kitle:** lisanslı mimarlar, konut tasarımcıları, müteahhitler, küçük ölçekli
tasarım-yapım firmaları — genel tüketici değil. Aşağıdaki her iddia 2026-11-05/06 tarihinde
canlı olarak doğrulandı: Maket.ai'nin ve ARCHITEChTURES'ın kendi pazarlama/fiyatlandırma
sayfaları yeniden çekildi (hafızadan değil), HomePlan'daki her ekran görüntüsü/dosya ise
HomePlan'ın gerçek canlı üretim motoru üzerinden fiilen çalıştırılarak elde edildi (production
ile aynı kod tabanını çalıştıran self-host bir kurulum, `homeplan-arhansubas-projects.vercel.app`
ile birebir aynı motor). HomePlan'ın gerçek bir eksiği varsa, burada eksik olarak yazılıyor.
Uydurma istatistik yok, "10 kat daha hızlı" gibi abartılı tahminler yok.

---

## 1. Gerçekte kimle karşılaştırıyoruz

- **Maket.ai** — konut projelerinde en yaygın kullanılan yapay zeka kat planı üreticisi
  (HomePlan'ın doğrudan rekabet ettiği kategori). `maket.ai`, `/features`, `/pricing`
  sayfalarından canlı olarak doğrulandı (2026-11-05/06).
- **ARCHITEChTURES** — en yakın gerçek mimar/geliştirici odaklı rakip: BIM tabanlı (IFC
  çıktısı, LOD 200+ seviyesi), kendi sitesine göre ev sahiplerine değil "serbest
  çalışanlardan büyük firmalara" profesyonellere yönelik. `architechtures.com`,
  `/pricing` sayfalarından canlı olarak doğrulandı (2026-11-06).
- **Snaptrude** (not düşüldü, derinlemesine test edilmedi) — zaten Revit iş akışında olan
  firmalar için en güçlü BIM/Revit tabanlı alternatif, yıllık 499 dolardan başlıyor. Burada
  satır satır karşılaştırmaya dahil edilmedi çünkü farklı bir iş akışını hedefliyor (metin
  girdisinden LOD 300-350 Revit teslimine), HomePlan'ın anlık web üreticisinden farklı.

---

## 2. Fiyatlandırma, gerçek rakamlar

| | **HomePlan** | **Maket.ai** | **ARCHITEChTURES** |
|---|---|---|---|
| Ücretsiz katman | $0 (barındırılan): tek katlı, Studio düzenleme, 3D kütle görünümü, PNG çıktısı, **sınırsız**, kredi sistemi yok | $0: 30 tek seferlik kredi, tek kat, **çıktı yok** (yalnızca link paylaşımı) | Fiyatlandırma sayfalarında self-servis ücretsiz katman yayınlanmamış |
| Giriş seviyesi ücretli katman | **$49/ay (barındırılan)** veya **kendi sunucunuzda sonsuza dek $0** (MIT lisansı, aynı kod, kredi sınırı yok) — çok katlı, L-biçimli, PDF/DXF/IFC çıktısını açar | **$20/ay** ("Homeowner"): aylık 300 kredi, PDF/DXF/render çıktısı, ayda 15 kata veya 30 render'a kadar | **$49/ay**, yıllık faturalandırma ($588/yıl): sınırsız AI üretimi, DXF/IFC/XLSX çıktısı, 200 kayıtlı tasarım |
| Sonraki katman | — (kendi sunucunuzda barındırmak bu ihtiyacı ortadan kaldırıyor) | $100/ay ("Pro"): aylık 3.000 kredi, 5 insan onaylı yükleme, özel şablonlar | $294/ay ("Business"): maliyet/finansal analiz, 1.200 tasarım, hesap yöneticisi |
| En üst katman | — | Özel fiyat ("Scale"): API erişimi, toplu içe aktarma | Özel fiyat ("Enterprise") |

**Dürüst okuma, pazarlama değil:** HomePlan'ın barındırılan ücretsiz katmanı hiçbir çıktı
vermiyor — bir mimarın AutoCAD'de gerçekten açabileceği bir DXF dosyası için $49/aylık Pro
katmanına (ya da kendi sunucunuza) ihtiyacınız var. Maket'in $20/ay katmanı zaten PDF/DXF/render
çıktısını içeriyor, bu da HomePlan'ın barındırılan sitedeki "çıktı için öde" fiyatının altında
kalıyor. **Gerçek fark kendi sunucunuzda barındırma seçeneğinde**: HomePlan MIT lisanslı ve
$49/aylık özelliklerin tamamı (çok katlı, L-biçimli, PDF/DXF/IFC, sınırsız üretim) kendi
sunucunuzda çalıştırırsanız sonsuza dek ücretsiz — ne Maket.ai ne de ARCHITEChTURES bunu hiçbir
fiyata sunmuyor, çünkü ikisi de açık kaynak değil.

---

## 3. Özellik özellik, her birinde gerçekte ne var

| Özellik | HomePlan | Maket.ai | ARCHITEChTURES |
|---|---|---|---|
| Metinden kat planına üretim | Evet — gerçek hesaplanmış geometri (oda/duvar/kapı), difüzyon görseli değil | Evet — "2-3 dakika," 1-4 kat | Evet — gerçek zamanlı üretim motoru |
| Brief başına birden fazla varyasyon | Evet, her seferinde 3 gerçek düzen (Compact/Classic/Wide), ücretsiz karşılaştırma | Evet | Evet |
| Manuel tuval düzenleme | Evet — Studio'da sürükle/boyutlandır, artı düz dilde yazılan düzenlemeler (yaygın ifadeler için AI çağrısı yok) | Evet — "sıfırdan çiz," üretilen planları iyileştir | Evet — manuel düzenleme modu |
| Mevcut planı yükleyip yeniden işleme | Evet — PDF/fotoğraf/tarama → OpenRouter görsel modeliyle vektörleştirme | Evet — PDF/fotoğraf/tarama | Pazarlama materyallerinde doğrulanmadı |
| PDF çıktısı | Evet (Pro/kendi sunucu) | Evet (ücretli katmanlar) | **Hayır** — yalnızca XLSX/DXF/IFC, PDF listede yok |
| DXF çıktısı | Evet (Pro/kendi sunucu) | Evet (ücretli katmanlar) | Evet |
| **IFC / BIM çıktısı** | **Evet** — gerçek IFC4 STEP dosyası (IfcWall/IfcDoor/IfcWindow/IfcSpace, `web-ifc`'in kendi WASM ayrıştırıcısıyla round-trip doğrulanmış) | **Hayır** — sitelerinde hiçbir yerde geçmiyor | Evet — LOD 200+, temel konumlandırmaları |
| 3B kütle görünümü | Evet — planın gerçek oda/duvar verisinden, uygulama içinde açıkça "fotogerçekçi değil" diye belirtiliyor | Evet — **"fotogerçekçi 3B"** olarak pazarlanıyor | Navigasyonlu 3B düzenleme, fotogerçekçi olarak pazarlanmıyor |
| İç mekan gezintisi (walkthrough) | Evet — gerçek göz hizasında WASD + sürükleyerek bakma, gerçek kapı/duvar çarpışma kontrolü | Evet — açıkça **"geleceğin evinizde fotogerçekçi 3B'de gezinin"** | Doğrulanmadı |
| **3B görsel kalite, dürüstçe** | **Düz gölgeli parametrik geometri.** Maket'in fotogerçekçi iddiasına karşı gerçek, ikincil bir eksik — henüz ele alınmadı, gizlenmek yerine burada belirtiliyor | Fotogerçekçi (kendi iddiaları, bağımsız olarak doğrulanmadı) | Kendi sitelerine göre fotogerçekçi değil |
| Mobilya / malzeme | 22 tip katalog, 5 parça artık gerçek CC0 3B model (kutu değil), zemin/duvar renk seçici | "Kendi mobilyanızı getirin," gerçek zemin/fayans/boya uygulama | Pazarlama materyallerinde odak alanı değil |
| İmar / yönetmelik uyumu | Evet — genel, açıkça **yargı bölgesine özgü doğrulanmamış** bir temel referansa karşı deterministik çekme payı + lot kapsama + yükseklik kontrolü, artı belirli bir şehrin gerçek kodunun elinde olmadığını **dürüstçe belirten** serbest metin imar soru-cevap asistanı | Sitelerinde **hiçbir şey bulunamadı** | Kullanıcılar oda başına min/maks alan ve yükseklik kısıtları girerek "proje uyumluluğunu sağlayabiliyor" — daha resmi, kurumsal odaklı |
| Hesap/kayıt zorunluluğu | Yok — kayıt olmadan üretim | Ücretsiz katman 30 kredi, kayıt yine de gerekiyor | Doğrulanmadı |
| Açık kaynak / kendi sunucunuzda barındırma | **Evet — MIT lisansı, kodun tamamı** | Hayır | Hayır |
| Hedef kullanıcı (kendi ifadeleriyle) | "Mimarlar, müteahhitler ve küçük ekipler" | Geniş — ev sahiplerinden "Scale" kurumsal katmanına kadar | "Serbest çalışanlardan büyük firmalara" — açıkça ev sahiplerine değil |

HomePlan'ın dürüstçe geride olduğu yer: **fotogerçekçi render** (Maket'in pazarlanan gücü) ve
ARCHITEChTURES'ın imar kısıtlama araçları HomePlan'ın kendi "yargı bölgesine özgü
doğrulanmamış" temel referansından daha olgun/kurumsal görünüyor — sahip olmadığımız bir eşitliği
iddia etmiyoruz.

HomePlan'ın dürüstçe önde olduğu yer: **Maket.ai'de hiç bulunmayan IFC/BIM çıktısı**, **hiçbir
rakibin sunmadığı ücretsiz kendi sunucunuzda barındırma seçeneği**, **en azından var olan ve
kendi sınırlarını dürüstçe belirten bir imar uyumu asistanı** (Maket'in konuyla ilgili tam
sessizliğine karşı), ve aşağıdaki **koruyucu kontrol (guardrail) deseni** — bu geçişin gerçek
manşet bulgusu.

---

## 4. Gerçek manşet: HomePlan neyin yanlış olduğunu söylüyor. Bunu bilerek test ettik.

Ne Maket.ai'nin ne de ARCHITEChTURES'ın pazarlama materyallerinde yapısal kalite uyarı sistemine
benzer bir şey var — oda en-boy oranı kontrolü yok, kapı açıklığı kontrolü yok, "bu oda
sığmıyor" uyarısı yok. Ücretli hesap olmadan onların gerçek üretim kalitesini test edemedik
(Maket'in ücretsiz katmanında kart gerektirmeden HomePlan'ın varsayılan olarak gösterdiği
detay seviyesinde ölçülü çıktıyı inceleme imkanı yok), bu yüzden onları doğrudan başa baş
yenme iddiasında bulunmuyoruz. Dürüstçe gösterebildiğimiz şey şu: HomePlan'ın canlı üreticisi
üzerinden geçirilen üç gerçek brief'te, **geçsin ya da geçmesin, her çıktı belirli, numaralı,
eyleme geçirilebilir bir uyarıyla geliyor** — tıpkı bir linter'ın gerçek bir kod hatasını
sessizce göndermek yerine işaretlemesi gibi. Profesyonel biri için "bu yapay zeka çöpü mü"
sorusunun pratik cevabı bu: hangi odanın ne kadar yanlış olduğunu tam olarak söyleyen bir araç,
size sadece bir resim veren bir araçtan kategorik olarak farklıdır.

### Test 1 — 2 katlı, 4 yatak odalı / 2,5 banyolu, 2.900 sqft (~270 m²) aile evi, bitişik 2 araçlık garaj, çalışma odası, kapalı ön veranda

Gerçek bir "üst segment alıcı" programı — bir mimarın gerçek bir müşteriden alacağı türden,
basit bir deneme brief'i değil. 3 gerçek varyant üretildi (Compact/Classic/Wide), hepsinde
doğru 2 kat merdiven hizalaması ve eşleşen taban izi var. **Wide** varyantı: 17 oda, 3.132 sqft
(~291 m²), 1 dürüst uyarı — *"Ana Banyo alanı için gerçekçi olmayan bir şekle sahip (6,3' × 20',
3,2:1) — toplam metrekareyi artırın veya oda sayısını azaltın."* Gerçek bir bulgu, seçilerek
sunulmadı: **tam olarak bu program için (4 yatak, 2,5-3 banyo, 2.800-3.200 sqft, 2 kat) denediğimiz
birkaç farklı metrekare değerinde 3 varyantın hepsi en az 1 ana banyo veya ikincil yatak odası
en-boy oranı uyarısı taşıdı** — bu program şeklinde gerçek, tekrarlanabilir bir motor sınırlaması,
tek seferlik bir durum değil. `plans/homeplan.md` dosyasında gerçek bir takip maddesi olarak
işaretlendi, burada gizlenmedi.
Gerçek PDF (19,6KB), DXF (24,2KB) ve IFC (34,8KB) çıktıları üretildi ve `exports/` klasörüne
kaydedildi.

### Test 2 — bağımsız 1 yatak odalı ADU (ek konut birimi), mini mutfak, tam banyo, gömme çamaşır dolabı, tek kat

ADU'lar küçük firmalar için gerçek, hızla büyüyen bir kategori (ABD'deki çoğu yargı bölgesi artık
otomatik onay zorunlu kılıyor). **Yasal asgari 600 sqft'te (~56 m²)**, HomePlan'ın gerçek, dürüst
bir eksiği var: ADU için değil, ev için boyutlandırılmış tam bir oturma+mutfak+yemek+çalışma
programı üretiyor, bu da **her varyantta 7 uyarıya** yol açıyor
(`stills/case2-adu-600sqft-broken-baseline.png`). Bu, bu depoda stüdyo daireler için zaten
bulunup düzeltilmiş olan hata sınıfıyla aynı (`bbcc5be`, 2026-11-05) — sadece ADU gibi
stüdyo-olmayan küçük metrekareli programlara henüz genişletilmemiş. Burada gizlenmek yerine
belirtiliyor ve bir takip maddesi olarak kaydedildi.
Daha gerçekçi bir **850 sqft'te (~79 m²)** tablo tersine dönüyor: **1 dürüst uyarıya** düşüyor
("Oturma Odası'na açılan kapı mobilyaya çarpabilir — o parçayı taşıyın veya odayı genişletin"),
gerçek 8 odalı program (Giriş/Oturma Odası/Mutfak/Yemek Odası/Ana Yatak Odası/Ana Banyo/Banyo/
Koridor), gerçek ölçülü oda tablosu, gerçek 3B kütle görünümü, gerçek PDF/DXF/IFC çıktıları
(9,5KB/22,8KB/32,8KB).

### Test 3 — 4 yatak odalı / 3 banyolu, 2.200 sqft (~204 m²), tek kat, avlulu L-biçimli, bitişik 3 araçlık garaj

Gerçek yapısal karmaşıklık durumu: dikdörtgen olmayan taban izi, bir avlu boşluğu, iki ayrı
koridor hattı, 3 araçlık garaj kütlesi. HomePlan, L-biçimi + avlu topolojisini doğru şekilde
üretti (17 gerçek oda, 2.443 sqft, 10,5' × 29' ölçülerinde tam ölçülü bir avlu). **Compact**
varyantı en az uyarıya sahipti (1: bir yatak odası/banyo boyutlandırma notu); bu yakalama için
Studio'da açtığımız **Classic** varyantında daha fazlası vardı (toplam 4) — bu metrekare
hedefinde rahat 35 sqft asgarinin altında kalan iki ikincil banyo, artı bir mutfak kapı açıklığı
uyarısı — yine belirli odalar, belirli rakamlar, belirsiz bir "bir şeyler ters" değil.

Bu geçişteki en dürüst bulgu İmar Asistanı'nın sonucu: genel, örnek niteliğindeki 60' × 120'
temel arsaya karşı **lot kapsama GEÇTİ** (2.443 sqft taban izi, 7.200 sqft'lik arsanın %33,9'u,
%35 sınırının altında) ve **yükseklik GEÇTİ** (35' sınırına karşı tahmini 18'), ama **çekme payı
mesafesi doğru şekilde KALDI** — "çekme paylarından sonra yapılabilir alan 46' × 85'; bu planın
sınır taban izi 54' × 53'. Hiçbir yönde yapılabilir alana sığmıyor." Sadece her zaman GEÇTİ diyen
bir imar kontrolcüsü şüphelidir; gerçek bir L-biçimli planı standart bir banliyö arsasının çekme
payları için fazla geniş olduğunu doğru şekilde işaretleyen bir kontrolcü işini yapıyordur.
Gerçek PDF/DXF/IFC çıktıları (13,9KB/34,6KB/61,3KB — üçü arasında en büyük IFC dosyası,
L-biçiminin gerçek ek duvar/oda sayısını yansıtıyor) imar sonucundan bağımsız olarak yine de
doğru şekilde üretildi — bu araçta çıktı alma ve uyumluluk kontrolü doğru şekilde birbirinden
bağımsız.

**Yukarıdaki her ekran görüntüsü, canlı üreticinin gerçek, düzenlenmemiş bir yakalamasıdır**
(production ile aynı `main` dalı kodunu çalıştıran kendi sunucuda barındırılan bir kurulum) —
üç durum için de tam seti (varyant seçici, gerçek ölçülü oda tablolu Studio düzenleyici, 3B kütle
görünümü, İmar Asistanı) için `stills/` klasörüne, gerçek indirilen PDF/DXF/IFC dosyaları için
`exports/` klasörüne bakın.

---

## 5. Bir mimar ne kullanacağına karar verirken bunun anlamı

- **Hızlı, müşteriye gösterilecek bir konsept istiyorsanız ve BIM ya da kendi sunucunuza ihtiyaç
  duymuyorsanız**: Maket.ai'nin fotogerçekçi render'ı HomePlan'ın henüz eşleşmediği gerçek, dürüst
  bir avantaj.
- **Bir BIM/MEP danışmanına verecek bir IFC dosyasına ihtiyacınız varsa ve yıllık 588 dolarlık bir
  taahhüde girmek istemiyorsanız**: HomePlan, bu üçü arasında IFC çıktısı dahil ücretsiz kendi
  sunucunuzda barındırılabilen tek seçenek.
- **Gerçek yönetmelik kısıtlarıyla yoğun çok aileli/karma kullanım projesi yapıyorsanız**: ne
  Maket.ai ne de HomePlan bunun için inşa edilmedi — ARCHITEChTURES'ın oda başına uyumluluk girdisi
  ve LOD 200+ BIM'i daha yakın bir uyum, ölçek için ise TestFit/ArkDesign.ai (burada derinlemesine
  test edilmedi) özel olarak inşa edilmiş.
- **Bir saat harcamadan önce bir aracın planı kendi dürüst değerlendirmesini görmek istiyorsanız**:
  HomePlan'ın oda bazlı numaralı uyarıları, bu geçişte gösterilen gerçek bir fark — sadece
  pazarlama metnini okumadık, bizzat test ettik.
