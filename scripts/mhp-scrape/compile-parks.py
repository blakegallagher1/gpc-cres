#!/usr/bin/env python3
"""Compile all scraped mobile home park data from batch results, deduplicate by park ID."""

import re
import csv
import sys

# All raw data from 6 batch scrapes - pipe-delimited: PARK_ID|NAME|ADDRESS|CITY|STATE|ZIP
RAW_DATA = """
14597|Touchet Mobile Home Park|201 Touchet Drive|Abbeville|LA|70510
34159|Southland Mobile Home park|2830 Rodeo Road|Abbeville|LA|70510
129376|Abbeville Country Estate|Abbeville|Abbeville|LA|70510
14464|J & L Mobile Home Park|18732 Mouton Cove Drive|Abbeville|LA|70510
73476|Mouchs MH Park|6761 La Highway|Addis|LA|70710
30632|Riverboat Lane Mobile Home Park|7021 Highway 1 South|Addis|LA|70710
69933|S & R MH Park|6861 Highway 1 South|Addis|LA|70710
31360|Myhand Mobile Home Park|Myhand Street|Addis|LA|70710
65049|Lynn's MHC|4390 Peter Messina|Addis|LA|70710
43260|Bankstons Mobile Home Park|29020 La 43 Highway|Albany|LA|70711
38272|Pleasant Valley Estates|171 Pleasant Valley Drive|Pineville|LA|71360
27899|Twin Bridges Mobile Home Park|6046 Twin Bridge Road|Alexandria|LA|71303
14421|Dwaynes Mobile Park|229 Mary Hill Road|Pineville|LA|71360
75193|Spring Branch Estates|174 Philadelphia Road|Pineville|LA|71360
127964|Cypress Estates|650 North Bolton Ave.|Alexandria|LA|71301
14449|Hagans Mobile Home Park|128 Hagan Drive|Pineville|LA|71360
14361|Cabana Mobile Estates|6101 North Bolton Avenue|Alexandria|LA|71303
29643|Henry L B Mobile Home Park|3329 Old Marksville Highway|Pineville|LA|71360
14667|Elder's Mobile Home Park|9740 Highway 28 East|Pineville|LA|71360
49709|Hyland Mobile Home Park|1632 Hyland Park Drive|Pineville|LA|71360
14565|Suttons Mobile Home Park|7405 Esler Field Road|Pineville|LA|71360
74591|Binder Trailer Park|Binder Ln|Amite|LA|70422
74312|A. D. MHP|13674 Glen Ellis Rd|Walker|LA|70785
128026|Cane View MHC|214 Halfway House Road|Arnaudville|LA|70512
55674|Jaco Mobile Home Park|2083 Coteau Rodaire Highway # A|Arnaudville|LA|70512
14334|Azalea Gardens Mobile Home & RV Park|3300 Baker Boulevard|Baker|LA|70714
14475|Little Lake Estates|2732 Manchester Drive|Baker|LA|70714
14404|Crestview Village|5885 Lavey Ln|Baker|LA|70714
127896|Lavey Lane Mobile Home and RV Park|5510 Lavey Lane|Baker|LA|70714
32036|Hideaway Acres|13655 Brown Road|Baker|LA|70714
14558|Saint James Mobile Home Community|4702 Lavey Lane|Baker|LA|70714
29275|Fredericks Mobile Home Park|523 Fredericks Lane|Baldwin|LA|70514
28561|Daspit Mobile Home Park|821 Brookhaven Drive|New Iberia|LA|70563
84217|Luke's Trailer Park|157 Elm Street|Centerville|LA|70522
126124|French Quarter Estates|705 Orleans Ave|New Iberia|LA|70563
111086|River Edge Courts|508 Taft St|Patterson|LA|70392
128420|Roys Lane Mobile Home Park|Roys Ln|Franklin|LA|70538
14570|Teche Valley Mobile Home Park|400 Rue Degravelle|New Iberia|LA|70563
28610|Boudreaux's Mobile Home Park|2716 Main Street|Jeanerette|LA|70544
14653|Violas Mobile Home Park|501 1/2 9th St|Franklin|LA|70538
14643|Silver Maple Mobile Home Park|807 Highway 1204|Ball|LA|71405
55672|Barron Mobile Home Park|564 Highway 1204|Ball|LA|71405
14537|Rosebud Mobile Estates|603 Mercer Drive|Ball|LA|71405
14511|Spring Branch Estates|4902 Monroe Highway|Pineville|LA|71405
40611|Cut-off Road Trailer Park|Trevor Drive|Bastrop|LA|71220
104837|Cherry Ridge Mobile Home Park|Cherry Ridge Road|Bastrop|LA|71220
55666|Raccourici Park|5162 La Highway 419|Batchelor|LA|70715
71241|Hendricks|8158 Elliot Road|Baton Rouge|LA|70817
14516|Pecue Mobile Home Park|7550 Pecue Ln|Baton Rouge|LA|70808
67264|Torrey Pines|16352 Old Hammond Hwy|Baton Rouge|LA|70816
14506|Oak Glen Terrace|3838 Thomas Road|Baton Rouge|LA|70811
29472|Four Season Mobile Home Park|7950 Hooper Road|Baton Rouge|LA|70811
14373|Cedarcrest Mh Park|10615 Airline Highway|Baton Rouge|LA|70816
55664|Gardere Mobile Park Inc|8604 Rush Ave Apt B|Baton Rouge|LA|70810
14356|Broadmoor Mobile Home Park|9955 Florida Boulevard|Baton Rouge|LA|70815
14349|Big Oaks Mobile Home Park|3700 Victoria Drive|Baton Rouge|LA|70812
14444|Granberrys Mobile Home Park|4250 Blount Road|Baton Rouge|LA|70807
55662|Night Rv Park|14740 Florida Blvd|Baton Rouge|LA|70819
129713|Prescott Place Mobile Home Community|7100 Prescott Rd|Baton Rouge|LA|70812
14417|Sherwood Forest Mobile Home Park|349 South Flannery Road|Baton Rouge|LA|70815
14567|Tangelwood West Trailer Park|9477 Lansdowne Road|Baton Rouge|LA|70818
14579|Victoria Trailer Court|4415 Victoria Drive|Baton Rouge|LA|70812
83649|Park Place|1411 La-182|Morgan City|LA|70380
80267|Clements Trailer Park|1224 Clements Ln|Morgan City|LA|70380
129030|E & L Estates LLC|2897 Hwy 182 E|Morgan City|LA|70380
84585|Little Pine Trailer Park|523 Little Pines Ln|Morgan City|LA|70380
70466|Cefalu MHP|Keith St|Morgan City|LA|70380
29412|Pines Lane Mobile Home Park|Little Pines Lane|Morgan City|LA|70380
78235|Jordin Lane Mobile Home Park|113 Jordin Ln|Bayou Vista|LA|70380
127234|Coastwide Estates|Electric Lane|Morgan City|LA|70380
126092|Fairview Place|101 Vista Village Ln|Morgan City|LA|70380
66227|Mhp|301 Grizzaffi St|Morgan City|LA|70380
103265|Belle Chasse Mobile Home Park|10700 Hwy 23|Belle Chasse|LA|70037
77515|River Oaks|180 River Oak Dr.|Belle Chasse|LA|70037
31440|Southern Oaks|East 3rd Street|Belle Chasse|LA|70037
129657|Cruisers RV Park|14573 La-23|Belle Chase|LA|70037
129659|Cajun Oaks RV Park|106880 Hwy 23|Belle Chase|LA|70037
32743|Timber Ridge Mobile Home Park|428 Planters Canal Road|Belle Chasse|LA|70037
126358|Naomi MHP|14668 Highway 23|Belle Chasse|LA|70037
129224|Oak Harbor|Belle Chasse|Belle Chasse|LA|70037
83591|Brunson Trailer Park|102 Brunson Ln|Benton|LA|71006
14423|East Highland Mobile Home Park|954 Ferndale Boulevard|Haughton|LA|71037
125732|Maplewood MHP|452 Maplewood Dr|Bossier City|LA|71111
14517|Pepper Point Mobile Park|6219 East Texas Street|Bossier City|LA|71111
14553|Southern Living Mobile Home Park LLC|5303 E Texas St|Bossier City|LA|71111
83647|Thurmans Mobile Home Park|North Thurman Road|Haughton|LA|71037
28444|Bayou Mobile Estates|5901 East Texas Street|Bossier City|LA|71111
14658|Academy Mobile Home Estates|Highway 157 South|Haughton|LA|71037
14411|Deer Valley Mobile Home Community|321 North Elm Street|Haughton|LA|71037
27890|Country Road Mobile Home Park|2600 Horacek Road|Haughton|LA|71037
34511|Farm Mobile Home Park|129 Windamere Drive|Haughton|LA|71037
14507|Oak Haven Mobile Home Park|108 Oakhaven Drive|Haughton|LA|71037
14518|Pine Creek Mobile Home Estates|1000 Acadian Boulevard|Princeton|LA|71067
14520|Pine Hill Mobile Home Park & RV Park|2 Pine Hill Circle|Haughton|LA|71037
14446|Santa Fe Village Mobile Home Park|4809 East Texas Street|Bossier City|LA|71111
14642|Parro Mobile Home Park|159 Parro Lane|Berwick|LA|70342
104045|Shiloh Trailer Park|1801 Rose St|Berwick|LA|70342
14544|Todd Mobile Home Park|271 Grandwood Drive|Patterson|LA|70392
14605|Willow Bend|2730 Highway 182 West|Patterson|LA|70392
14591|Cedar Ridge Estates|9690 Highway 79|Bethany|LA|71007
14440|Glen Leaf Manufactured Community|7400 Glen Leaf Drive|Shreveport|LA|71129
14353|Blue Ridge Mobile Home Park|6900 Buncombe Road|Shreveport|LA|71129
14435|Forest Estates|6201 Bert Kouns Industrial Loop|Shreveport|LA|71129
14521|Pinecrest|6700 Jefferson Paige Road|Shreveport|LA|71119
14561|Stonegate|6801 West 70th Street|Shreveport|LA|71129
14344|Bellavista Mobile Home Village|2651 Barron Road|Keithville|LA|71047
14459|Huntington Mobile Park|6850 Klug Pines Road|Shreveport|LA|71129
14617|Fox Glen Mobile Home Park|6260 Buncombe Road|Shreveport|LA|71129
14355|Brady's Mobile Home Park|5044 Greenwood Rd|Shreveport|LA|71109
31213|Southview Estates|9973 Mansfield Road|Keithville|LA|71047
14593|Willa-Villa Mobile Home & RV|250 Willa Villa Drive|Bogalusa|LA|70427
40207|Oak Villa MHC|15455 Ronald Reagan Hwy.|Covington|LA|70433
105481|Covington Oaks Mobile Home Park|1555 West 21st Avenue|Covington|LA|70433
14523|Plantation Acres Manufactured Home Community|200 Bayou Loop|Bossier City|LA|71112
14514|Pecan Valley Estates|6507 Barksdale Boulevard|Bossier City|LA|71112
14552|South Bossier Mobile Home Park|1920 Alfred Lane|Bossier City|LA|71112
14408|Davidson Mobile Home Park|65 Davidson Drive|Bossier City|LA|71112
99675|La Visage Rouge|100 Rue Tete Red Ct|Bourg|LA|70343
94825|Blue Bayou Mobile Home Court|224 Blue Bayou|Houma|LA|70364
14368|Carriage Cove Mobile Home Park|9241 Diamond Head Court|Houma|LA|70363
76560|Goodman's Mobile Home Park|130 Goodman Ct.|Houma|LA|70364
101773|Lecompte Trailer Park, Llc|103 Lecompte Lane|Houma|LA|70363
14530|Remwood Park|24 Rembert Court|Houma|LA|70364
71200|Rogers Rentals|8315 Highway 308|Lockport|LA|70374
14434|Faith Trailer Court|1825 Coteau Road|Houma|LA|70364
108820|Wilson Gaidry Mobile Home Park|8911 Park Ave|Houma|LA|70363
14366|Capri Court|105 Capri Court|Houma|LA|70361
79397|Duplantis Mobile Home Park|4346 Highway 56|Houma|LA|70363
27901|Brien's Mobile Village|176 Brien Street|Houma|LA|70364
29225|Country Boy Mobile Home Park|106 Kevin Street|Houma|LA|70364
72645|Floyd Court|301 Dewey St|Houma|LA|70364
14663|Millers Mobile Home Park|Zifful Court|Houma|LA|70364
14477|Lost Bayou Mobile Home Park|210 Ruth Street|Houma|LA|70364
14494|Mott Trailer Park|2000 Effie Street|Houma|LA|70363
14589|Whispering Oaks Mobile Home & RV Parks|9026 Main Street|Houma|LA|70363
32175|Mossy Point Mobile Home Park|356 Moss Point Drive|Boyce|LA|71409
55488|Jennings Estates|103 Country Ln|Pineville|LA|71360
55487|Haphazard Mh Estates|2528 Hanes Rd|Pineville|LA|71360
33509|Chateau Maison Manufactured Home Community|1231 Hebert Ave|Breaux Bridge|LA|70517
103143|Atchafalaya Mobile Home Park|1118 Melvin Dupuis Rd|Breaux Bridge|LA|70517
94541|Bayou Oaks|265 Half Rees Street|Breaux Bridge|LA|70517
73571|C & S Mobile Home Park|1778 Nursery Hwy|Breaux Bridge|LA|70517
106092|Pat's Mobile Home Park|1026 Roy J Melancon Rd|Breaux Bridge|LA|70517
88219|Poches RV Park|1080 Sawmill|Breaux Bridge|LA|70517
14639|Atchasalauga Acres|1041 Jean Lafitte|Breaux Bridge|LA|70517
14347|Bent Oak Trailer Park|4190 Poydras Highway|Breaux Bridge|LA|70517
55656|James Daigle Mh Park|153 Magnifique Rd|Breaux Bridge|LA|70517
71506|Anita Park|100 St. Ignatius|Broussard|LA|70518
27895|Belle Place Trailer Park|600 Saint Nazaire Road|Broussard|LA|70518
124048|Maturin Mobile Home Park|4010 Melancon Rd|Broussard|LA|70518
55651|Midway Mobile Park|1773 Duchamp Rd|Broussard|LA|70518
106412|Troy Louviere MHP|Captain Cade Rd|Broussard|LA|70518
14479|Maison Royale Mobile Home Park|1579 Duchamp Rd|Broussard|LA|70518
55655|Bruces Mh Park|210 Avenue B|Broussard|LA|70518
14482|Maxies Mobile Valley|4350 Highway 90 East|Broussard|LA|70518
55650|Miguez Mh Park|502 Avenue D|Broussard|LA|70518
29067|Bayou Dulac Mh Park|5244 Highway 115|Bunkie|LA|71322
71303|Evergreen MH Park|110 Evergreen St.|Bunkie|LA|71322
83981|Twin Oaks Mobile Park|170 Sydnic Lane|Hessmer|LA|71341
103395|Stafford's Four Corner RV and Trailer Park|322 Hospital Rd|Marksville|LA|71351
40686|Cosgrove Mobile Home Park|2108 George Drive|Opelousas|LA|70570
73617|F & M Mobile Home Park|Linus Street|Opelousas|LA|70570
85487|Deer Run Mobile Home Park|161 Cowboy Ln|Calhoun|LA|71225
64834|Milstead's Mobile Home Park|2984 Highway 80 West|Calhoun|LA|71225
75866|Pine Hill Mobile Home Community|2001 Highway 80 East|Calhoun|LA|71225
126282|Calhoun Crossing|141 Brownlee Rd|Calhoun|LA|71225
14540|Sandiford Three S Mobile Home Park|127 Rolleigh Road W|Calhoun|LA|71225
71850|Caldwell Estates|113 Caldwell Rd.|West Monroe|LA|71291
14382|Circle Drive Mobile Home Park|5415 Whites Ferry Road|West Monroe|LA|71291
40613|Diamond Mobile Home Park|155 Biedenhorn Drive|West Monroe|LA|71291
14418|Drew Mobile Home Park|755 Ole Highway 15|West Monroe|LA|71291
99359|Drew Shady Acres|1115 Ole Highway 15|West Monroe|LA|71291
72687|Green Pasture Mobile Home Park|702 Washington Street|West Monroe|LA|71292
46864|Morning Meadow Manufactured Home Community|307 New Natchitoches Road|West Monroe|LA|71292
14545|Shorewood Village Mobile Home Park|402 Avant Rd|West Monroe|LA|71291
92627|West Ouachita MHP|1988 Highway 34|West Monroe|LA|71292
14329|Caddo Ridge Mobile Home Park|616 Washington Street|West Monroe|LA|71292
14641|Magnolia Mobile Home Park|968 Wallace Dean Road|West Monroe|LA|71291
14560|Sterling Oaks Mobile Home Estates|1315 New Natchitoches Road|West Monroe|LA|71292
14505|Northwood Mobile Home Park|103 Briarwood Drive|West Monroe|LA|71291
81063|Pelican Estates|135 Dv Byrd Ln|West Monroe|LA|71292
32864|Belaire Mobile Home Park|182 Betty Lane|West Monroe|LA|71291
14365|Canary Motel & Trailer Courts|3002 Cypress Street|West Monroe|LA|71291
14624|A & H Mobile Home Park|211 Penny Drive|West Monroe|LA|71291
110936|Ben's RV Park|140 Alvin Rd|Cameron|LA|70631
14635|Gulf Stream Manor|8559 Gulf Highway|Lake Charles|LA|70607
30662|Hebert Estates and RV Park|205 Hebert Trailer Park|Lake Charles|LA|70607
125710|Park Longacre|760 Hwy 384|Lake Charles|LA|70607
14572|Tommasi Mobile Village|2500 Smith Road|Lake Charles|LA|70607
75489|Trahans Mobile Home Park|932 Tallow Rd|Lake Charles|LA|70607
14433|Fairview Mobile Estates|5859 Tom Hebert Road|Lake Charles|LA|70607
14346|Ben's Mobile Home Park|7114 Corbina Road|Lake Charles|LA|70607
14598|Campti Mobile Home Park|Tbd|Campti|LA|71411
72714|Bayou Blue MHP|440 Fairgrounds Rd|Natchitoches|LA|71457
31216|Bayou MHC|515 Fairgrounds Road|Natchitoches|LA|71457
128836|Bayou Gin MHP|440 Fairgrounds Rd|Natchitoches|LA|71457
28572|Chastity Acres|3686 Natchitoches Highway|Many|LA|71449
14371|Carters Mobile Home Park|1815 Highway 1|Natchitoches|LA|71457
74736|Grand Oaks Mobile Home Park|125 Mandy Lane Lot 14|Many|LA|71449
110994|Sunset Marina|Pine Thicket|Many|LA|71449
55645|Daves MH Village|5215 N University Avenue|Carencro|LA|70520
55647|A & M Mh Park|107 Romero|Carencro|LA|70520
33709|C & D Mobile Home Park|417 Louveteau Road|Carencro|LA|70520
55646|Crepe Myrtle Mobile Park|4027 NW Evangeline Trwy|Carencro|LA|70520
55644|Executive Choice Mh Park|5217 N University Ave|Carencro|LA|70520
55643|Indian Hill Mh Park|121 Apache Cir|Carencro|LA|70520
55642|La Roulette Mh Park|201 Andre St|Carencro|LA|70520
55641|North Acadian Mh Park|515 Sonnier Rd|Carencro|LA|70520
55640|Parkland Mobile Home Park|106 Highway 726|Carencro|LA|70520
14524|Plauches Little Acres|152 Plauche Drive|Carencro|LA|70520
14629|Vatican Square Mobile Village|126 Kidder Road|Carencro|LA|70520
126922|Family First MHP|5617 Point Clair Rd|Carville|LA|70721
14603|Ascension Estates LLC|8544 S Saint Landry St|Gonzales|LA|70737
31210|Twin Lakes Mobile Estates|37313 Hwy 74|Geismar|LA|70734
76662|Oak Place|38259 Highway 621|Gonzales|LA|70737
31357|Dutchtown Lane Mobile Home Park|37454 Cornerview Road|Geismar|LA|70734
129509|Achord's MHP|16098 Bluff Rd|Prairieville|LA|70769
14673|Chalmette Mobile Home Park|2101 Marcelle Street|Chalmette|LA|70043
66344|Seelas Trailer Court|Po Box 1008|Chalmette|LA|70044
40480|Riveredge Trailer Park|1904 Riveredge|Chalmette|LA|70043
31208|Whispering Pines Mobile Home Park|198 North Myrtle Street|Choudrant|LA|71227
14407|Davids Trailer & RV Park|112 Tan Street|Church Point|LA|70525
94139|Bon Ami Mobile Home Park|2810 La Highway 35|Opelousas|LA|70570
14372|CBS Mobile Home Park|343 Country Ridge Rd|Opelousas|LA|70570
125830|Suburban Village|343 Country Ridge Rd|Opelousas|LA|70570
130435|Willow Trace|4403 Highway 182|Opelousas|LA|70570
42290|Belle Ridge MHP|5343 Highway 182|Opelousas|LA|70570
37811|Bonners Mobile Home Park|4873 Highway 139|Collinston|LA|71229
14427|Azalea Homes & RV Gardens|400 Dolly Drive|Monroe|LA|71203
14331|Aurora Mobile Home Parks|5602 Desiard Street|Monroe|LA|71203
74795|B and J Mobile Home Park|300 Rader Dr.|Monroe|LA|71203
74927|Double Circle Y MHP|215 Rader Dr.|Monroe|LA|71203
28563|Hickory Hollow Mobile Home Park|851 Rowland Road|Monroe|LA|71203
14428|Easy Living Mobile Home Park|5107 Blanks St|Monroe|LA|71203
14412|Deluxe Mobile Home Park|5204 Desiard Street|Monroe|LA|71203
14424|East Ouachita Mobile Home Park|1534 Frenchmans Bend Road|Monroe|LA|71203
55495|Eastside Mobile Home Park|117 Dianna Dr|Monroe|LA|71203
55494|Easy Living Mh Park|7300 Frontage Rd|Monroe|LA|71202
111224|Riverton Lake Campground|531 Riverton Camp Rd|Columbia|LA|71418
29537|Reagans Mobile Home Park|4414 Winnsboro Road|Monroe|LA|71202
27898|Area 4 Mobile Park|345 Area 4 Road|West Monroe|LA|71292
14621|Cadeville Mobile Home Park|160 Chad Lane|Eros|LA|71238
14515|Pecanland Estates|2300 Garrett Road|Monroe|LA|71202
14328|Antique Acres Mobile Home Park|2665 Winnsboro Road|Monroe|LA|71202
34775|Evergreen Mobile Home Park|900 Evergreen Street|West Monroe|LA|71292
14576|Twin Pines Mobile Home Park|3060 Winnsboro Road|Monroe|LA|71202
14431|Evergreen Mobile Home Park|7600 US-171|Converse|LA|71419
110992|Youngs Mobile Home Park|Youngs Rd|Noble|LA|71462
30475|Green Acres Mobile Home Park|1301 Macarthur|Logansport|LA|71049
37783|Anderson Mobile Home Park|1891 North Main Street|Zwolle|LA|71486
66334|Peach Tree MHP|55 Peach Tree Lane|Noble|LA|71462
70657|Sepulvado Landing|Monica Lane|Noble|LA|71462
14402|Covington Manor Mobile Home Park|161 Barbee Road|Covington|LA|70433
14527|Pounds Mobile Home Park|20378 Highway 36|Covington|LA|70433
18848|Creekside Mobile Home Court LLC|15569 East Hoffman Road|Ponchatoula|LA|70454
43266|Cypress Creek Mobile Home Court|41058 South Range|Ponchatoula|LA|70454
14648|Pinelake Mobile Home Court|40430 E I 55 Service Road|Ponchatoula|LA|70454
38900|Dunson Oaks MHC|20061 Dunson Park|Ponchatoula|LA|70454
27874|Wind Crest Mobile Home Park|39437 South Hoover Road|Ponchatoula|LA|70454
14374|Chahta Mobile Home Park|1101 Colbert Street|Mandeville|LA|70448
14571|Timberland Trailer Park|59356 Transmitter Road|Lacombe|LA|70445
84899|Landons MHP|100 Quick Blvd|Ponchatoula|LA|70454
55637|Hub Mobile Park|1819 N Parkerson Ave|Crowley|LA|70526
75588|Trails South Trailer Park|212 Daniel St|Crowley|LA|70526
86843|Bayou Village Mobile Home Park|Kristie Dr/Standard Mill Rd|Rayne|LA|70578
76771|Iota Mobile Village|314 West Kennedy Ave|Iota|LA|70543
129010|Foreman Trailer Park|Foreman Drive|Rayne|LA|70578
14389|Country Air Mobile Home Park|Quarter Pole Road|Rayne|LA|70578
27903|Country Village Park|Country Village Lane|Egan|LA|70531
76968|Babin I-12 Trailer Park|26572 La Highway 1032|Denham Springs|LA|70726
81513|Eden Place Properties|10006 Eve Dr.|Denham Springs|LA|70726
14670|Linder Mobile Home Park|31531 Linder Road|Denham Springs|LA|70726
14632|Oak Forest Estates|22137 Walker South Road|Denham Springs|LA|70726
14528|Pannu Mobile Home Park|26229 Walker South Road|Denham Springs|LA|70726
106070|Edgewood Mobile Home Park|412 Edgewood Drive|Denham Springs|LA|70726
14637|Gray's Creek Mobile Home Park|9212 Lockhart Road|Denham Springs|LA|70726
106072|Madeline Heights Mobile Home Park|24715 Walker South|Denham Springs|LA|70726
105948|Manchester Place|36768 Highway 16|Denham Springs|LA|70726
14625|Highland Ridge Mobile Home Park|21440 Bonnie Drive|Denham Springs|LA|70726
14611|A & W Mobile Home Park|7775 Florida Boulevard|Denham Springs|LA|70726
55635|Watson Estates Mobile Home Park|35655 Bonnebell Dr|Denham Springs|LA|70706
55636|Danni Lane Mh Park|7367 Robinson Dr|Denham Springs|LA|70706
66063|Deville's Mobile Home Park|30205 Eden Church Road|Denham Springs|LA|70726
14425|Eastover Estates|25825 Aztec Drive|Denham Springs|LA|70726
31209|Eden Church Road Mobile Park|Eden Church Road|Denham Springs|LA|70726
98185|Pinewood Mobile Home Park|34922 Old La Highway 16|Denham Springs|LA|70706
14532|Ridgecrest Mobile Home Park|23453 Walker South Road|Denham Springs|LA|70726
14541|Seven Oaks Mobile Home Park|28760 Juban Road|Denham Springs|LA|70726
14456|Holliday Mobile Home Park|451 Petty St.|Deridder|LA|70634
29392|Hickory Creek|500 Hickory Creek Loop|Deridder|LA|70634
14630|Broussard Mobile Home Park|1515 Blankenship Drive|Deridder|LA|70634
38098|A & B Mobile Home Park|1208 Highway 112|Deridder|LA|70634
64569|Shady Oaks|1752 Pitkin Rd|Leesville|LA|71446
14676|T & W Trailer Park|195 Bundick Road|Leesville|LA|71446
14354|Bolton Ronnie Elimelech Mobile Home Park|3986 Vfw Road|Leesville|LA|71446
14360|Bynog's Trailer Park|1080 Belview Road|Leesville|LA|71446
14448|Hacienda Trailer Park|174 Lonnie Jeane Loop|Leesville|LA|71446
14486|Rays Mobile Home Park|427 Pitkin Road|Leesville|LA|71446
14573|Towering Pines Mobile Home Park|101 Gillies Street|Leesville|LA|71446
28768|Grandview Mobile Estates|115 Highland Drive|Kinder|LA|70648
81909|Hattie Hills MH Park|111 1st Street|Rosepine|LA|70659
14508|Oak Lane Mobile Home Park|21459 Highway 167|Dry Prong|LA|71423
74544|Cenla Park|9660 Highway 28 E|Pineville|LA|71360
55632|Goose Creek Mh Park|1596 Mccullin Rd|Dubach|LA|71235
89131|Country Aire Park|201 Lagneaux Rd|Duson|LA|70529
14441|Going West Mobile Estates|900 Leblanc Road|Duson|LA|70529
14638|Smiling C|1626 Duhon Road|Duson|LA|70529
14467|Teco's Mobile Home Park|514 Jenkins Road|Duson|LA|70529
32919|Pecan Acres|425 Toby Mouton Road|Duson|LA|70529
55631|Aaron Clark Mh Park|2180 S Fieldspan Rd|Duson|LA|70529
55630|Clifton Mh Park|6429 W Congress St|Duson|LA|70529
55629|Howard Bourque Mh Park|5305 W Congress St|Duson|LA|70529
55628|J & J Mobile Home Park|700 S A St|Duson|LA|70529
55627|Larfize Bourque Mh Park|5411 W Congress St|Duson|LA|70529
84587|Luxury Living|230 Jenkins Rd.|Duson|LA|70529
55616|Quiet Living Mh Park|210 Ray Pardue Rd|Duson|LA|70529
55612|Royal Mobile Home Park|7727 Cameron St|Duson|LA|70529
55611|Thibodeaux Mh Park|203 Yearling Rd|Duson|LA|70529
105908|AMP-JFP Circle MHP|La 18|Edgard|LA|70049
127048|E and P Deroche Trailer Park LLC|420 E 8th St|Gramercy|LA|70052
32800|Grand Bayou Mobile Home Park|114 Dorothy Drive|Thibodaux|LA|70301
14596|Woodland Heights Mobile Home Community|100 Woodland Drive|Thibodaux|LA|70301
14588|Wheel Estates Mobile Home Park|924 Whitlow Court|La Place|LA|70068
128032|Half Oak MHC|304 Half Oak Drive|Thibodaux|LA|70301
127508|Alma and Kids Trailer Park|Waverly Rd|Thibodaux|LA|70301
14388|Colonial Mobile Home Park|1370 East Airline Highway|La Place|LA|70068
126519|Reg's MHP|408 Reg Park|Reserve|LA|70084
14551|Solar's Mobile Home Park|1220 Winder Road East|Thibodaux|LA|70301
14568|Taylors Mobile Home Park|137 West Park Avenue|Thibodaux|LA|70301
14320|Academy Mobile Village & Apartments|2221 Jeff Davis Academy Road|Jennings|LA|70546
14649|Daigle's Mobile Park|1903 Airport Road|Jennings|LA|70546
14512|Cypress Estates MHC|1108 South Lake Arthur Avenue|Jennings|LA|70546
37217|Airport Mobile Home Park|1421 Airport Road|Jennings|LA|70546
14483|Mccutchen Mobile Home Haven|1424 Elton Road|Jennings|LA|70546
82505|Cypress Land Estates|12608 Tupelo Circle|Erath|LA|70533
83651|Brookhaven MH Estates|6609 Youngsville Rd|Youngsville|LA|70592
33446|Crepe Myrtle Mobile Home Park|1025 Langlinais Road|Youngsville|LA|70592
29765|Duncan Heights|3107 Oliva Road|New Iberia|LA|70560
39413|Elite Landing|7727 Sara Drive|Maurice|LA|70555
14498|New Horizon Mobile Home Park|1714 New Horizons Dr|New Iberia|LA|70560
14660|Plantation Village|4702 Plantation Village Drive|New Iberia|LA|70560
55404|Sunrise Mobile Home Park|105 Amireau Dr|Youngsville|LA|70592
14647|Thibodeaux Mobile Home Park|6711 Fremin Road|New Iberia|LA|70560
31948|Vermillion Court|104 Vermillion Circle|Youngsville|LA|70592
71677|Canebrake Mobile Home Park|2300 Darnall Road|New Iberia|LA|70560
87559|Ridgeway MHP|2911 Coteau Rd|New Iberia|LA|70560
14377|Charlies Mobile Home Village|3238 Deare Street|New Iberia|LA|70560
65797|J N J Estates|111 W. Saltilla|New Iberia|LA|70560
14323|Acadian Mobile Home Village|237 West Saint Peter Street|New Iberia|LA|70560
55492|Barbaras Mh Village|1355 Julia St|New Iberia|LA|70560
14461|Iberia Mobile Home Park|316 Mercedes Circle|New Iberia|LA|70560
14469|Kiper Mobile Home Park|2214 W Old Spanish Trail|New Iberia|LA|70560
14478|M & T Mobile Home Park|421 Fontelieu Drive|New Iberia|LA|70560
14488|Tree Lawn Trailer Court|935 Center Street|New Iberia|LA|70560
14489|Westland Rentals & Mobile Home Park|1500 Hopkins Street|New Iberia|LA|70560
77385|Double Wide Mobile Home Park|104 Orange St|Galliano|LA|70354
14463|J & K Mobile Park|133 East 123rd Street|Galliano|LA|70354
128038|Bayou Winds MHC|126 Vega Court|Gibson|LA|70356
55604|Donna Lynns Mh Park|154 Vega Ct|Gibson|LA|70356
83979|Roddy Road MHP|12195 Roddy Rd|Gonzales|LA|70737
49878|Cobb's Manufactured Home Park|13250 Roddy Rd|Gonzales|LA|70737
14650|Twin Oaks Mobile Home Park|14054 Highway 44|Gonzales|LA|70737
31305|Pine Park|42284 Bayou Narcissa Road|Gonzales|LA|70737
55603|Lakeland Estates|1406 N Coontrap Ave|Gonzales|LA|70737
14578|Vesta Mobile Home Park|2228 South Burnside Ave|Gonzales|LA|70737
14664|Country Boy Mobile Home Park|205 Harmony Street|Gray|LA|70359
126218|Bon Villa MHP|106-178 Bon Villa Ct|Gray|LA|70359
27897|Mobile Estates|506 Mobile Estates Drive|Gray|LA|70359
14452|Central Pointe Estates|17960 Will Ave.|Greenwell Springs|LA|70739
27902|Ponders Mobile Home Park|250 Lafayette Street|Gretna|LA|70053
33243|Landon Mobile Home Park|42554 Pumpkin Center Road|Hammond|LA|70403
129715|Airport Road MHC|18325 Miller Lane|Hammond|LA|70403
110866|Albany Mobile Home park|30544 Strawberry Lane|Hammond|LA|70403
40487|Dorason Estates|46269 West Cherry Street|Hammond|LA|70401
129120|Macedonia MHC|40195 Macedonia Rd|Hammond|LA|70403
37638|Intersection Connection Mobile Home Park|41489 W I-55 Service Road|Hammond|LA|70403
32082|Dave's Mobile Home Park|13444 Old Baton Rouge Highway|Hammond|LA|70403
33613|Hillside Mobile Home Park|43356 Klein Road|Hammond|LA|70403
33560|Joe's Mobile Home Park|46068 Milton Road|Hammond|LA|70401
14548|Silessi Mobile Home Park|42149 Greg Drive|Hammond|LA|70403
124052|West Yellow Water Park|42134 W Yellow Water Rd|Hammond|LA|70403
14410|Hassel's Trailer Park|3826 Peters Road|Harvey|LA|70058
14330|Ashland North|1425 West Tunnel Boulevard|Houma|LA|70360
14383|Circle G Mobile Home Park|1825 Bull Run Road|Schriever|LA|70395
100175|Peoples Mh Park|13394 Brickyard Rd|Independence|LA|70443
71959|Strawberry Heights|55141 Old Us Highway 51|Independence|LA|70443
129122|Oakview MHC|237 W Railroad Ave|Independence|LA|70443
103939|Blackwells Mobile Home Park|18320 Florida Blvd|Holden|LA|70744
37871|Baker's Mobile Home Park|838 Highway 61|Jackson|LA|70748
103433|Belmont Estate|5327 Island Road|Jarreau|LA|70749
14458|Patricia's Mobile Home Park|1st Street|Jena|LA|71342
14344|Bellavista Mobile Home Village|2651 Barron Road|Keithville|LA|71047
105331|Shadow Lake Rv Park|710 Barron Rd|Keithville|LA|71047
14403|Crest Trailer Park|212 East Airline Highway|Kenner|LA|70062
127528|Kenner Trailer Park|2517 Reverend Richard Wilson Dr|Kenner|LA|70062
77871|B & B Trailer Park|310 Todd Ave|Krotz Springs|LA|70750
14388|Colonial Mobile Home Park|1370 East Airline Highway|La Place|LA|70068
14571|Timberland Trailer Park|59356 Transmitter Road|Lacombe|LA|70445
14661|Drake mobile home Village|630 Brothers Rd.|Lafayette|LA|70507
85426|Floyd's Mobile Home Court|107 Floyd Street|Lafayette|LA|70501
14413|Kings Court Mobile Home Park|704 West Gloria Switch Road|Lafayette|LA|70507
29965|Sugar Ridge Mobile Home Park|211 East Gloria Switch Road|Lafayette|LA|70507
14645|Summerwood Mobile Home Community|3201 Kaliste Saloom Road|Lafayette|LA|70508
69543|Willow Springs Mobile Home Park|131 Hebert Road|Lafayette|LA|70506
14321|Acadian Acres Mobile Home Park|1410 Westgate Road|Lafayette|LA|70506
29950|Lafayette Oaks|1717 Eraste Landry Road|Lafayette|LA|70506
14582|Village Park Mobile Estate|6406 Johnston Street|Lafayette|LA|70506
14438|Mobile Home Acres|280 John Wayne Drive|Lafayette|LA|70508
14616|Queens Row Park|342 Queens Row|Lafayette|LA|70508
102229|Gary's Trailer Park|721 Lebesque Rd|Lafayette|LA|70507
14580|Victoria Village|2925 Mills Street|Lafayette|LA|70507
37613|Angelles Mobile Home Community|2321 Mills Street|Lafayette|LA|70507
128036|Country Mobile Living|1731 Lagneaux Road|Lafayette|LA|70506
55567|Southside Estates MHC|1301 Verot School Rd|Lafayette|LA|70508
37219|Westgate Mobile Home Park|3201 Kaliste Saloom Road|Lafayette|LA|70508
125922|Audubon Acres|1112 Lebesque Rd|Lafayette|LA|70507
55593|Benoit Mobile Park|1001 Patterson St|Lafayette|LA|70501
55591|Brambles Mobile Home Park|1409 E Broussard Rd|Lafayette|LA|70508
55590|Cadillac Street Mh Park|202 Cadillac St|Lafayette|LA|70501
55589|Cajun Mh Village|314 Malapart Rd|Lafayette|LA|70507
34048|Clifton Camochahe Mobile Home Park|235 Smalley Road|Lafayette|LA|70507
55586|Conques Mobile Home Park|3008 N University Ave|Lafayette|LA|70507
14397|Country Pine Mobile Estate|329 Lebesque Road|Lafayette|LA|70507
55584|Credeur Mh Park|101 Norine St|Lafayette|LA|70506
14429|Evangeline Trailer Park|705 West Gloria Switch Road|Lafayette|LA|70507
55581|Floyds Mh Park|1001 Willow|Lafayette|LA|70501
14454|Lafayette Mobile Home Park|2808 West Pinhook Road|Lafayette|LA|70508
14496|Mouton's Trailer Park|113 Porter Lane|Lafayette|LA|70501
33707|Mr. B's Mobile Home Park|2520 Ambassador Caffrey Parkway|Lafayette|LA|70506
14500|Norberts Golden Gate Mobile Home Park|800 Bonin Road|Lafayette|LA|70508
14503|Northgate Mobile Park|210 West Pont Des Mouton Road|Lafayette|LA|70507
55574|Northgrove Mh Park|104 Willow|Lafayette|LA|70501
55571|Pecan Acres Mh Park|1138 Breaux Rd|Lafayette|LA|70506
55566|Southern Consumer Mhp|403 Edison St|Lafayette|LA|70501
127956|Stacey Acres|210 W Pont Des Mouton Rd|Lafayette|LA|70507
55565|Twisted Oaks Mobile Park|129 Avalon St|Lafayette|LA|70508
55563|Voorhies Trahan Mh Park|136 Scott St|Lafayette|LA|70506
55560|Whittington Hts Mh Park|135 Whittington Dr|Lafayette|LA|70503
113592|Cooling Springs|5595 Highway 90 E|Lake Charles|LA|70615
14492|Moss Bluff Mobile Home Village|450 Parish Rd|Lake Charles|LA|70611
74286|Pecan Creek Mobile Estates|298 Thelma Lane|Lake Charles|LA|70611
14499|Oak Hurst Mobile Home Park|6675 Highway 90 East|Lake Charles|LA|70615
14509|Oakcreek Estates Mobile Home Park|239 North Perkins Ferry Road|Lake Charles|LA|70611
125910|Pin Oak Community|1277 N Hwy 171|Lake Charles|LA|70611
29107|North Bluff Mobile Estates|1490 Joe Miller Road|Moss Bluff|LA|70611
14636|Ridge Park|2499 Highway 378|Lake Charles|LA|70611
14376|Chardele Mobile Estates|2465 Highway 397|Lake Charles|LA|70615
14614|Le Bleu Mobile Home Park|1887 Arsene Road|Lake Charles|LA|70615
28643|Southern Meadows Mobile Home Park|Po Box 12612|Lake Charles|LA|70611
14341|Bayou Shades Mobile Village|2224 Old Highway 171 North|Lake Charles|LA|70615
27891|Evergreen Estates|2208 North Perkins Ferry Road|Lake Charles|LA|70611
14396|Country Oaks Mobile Home Park|805 Topsy Road|Moss Bluff|LA|70611
14426|Crestwood Community|5711 Broad Street|Lake Charles|LA|70615
14460|I-10 Mobile Village|583 I-10 Mobile Village Road|Lake Charles|LA|70615
14465|James Mobile Home Park|6336 East Opelousas Street|Lake Charles|LA|70615
14610|Quail Ridge|2187 Gauthier Road|Lake Charles|LA|70607
2267|Sugarloaf Community|2899 Sugarloaf Drive-Office|Lake Charles|LA|70607
14556|The Charleston MHC|5000 Leon Drive|Lake Charles|LA|70605
97901|Willow Ridge Mhp|1855 Red Davis Mccollister Rd|Lake Charles|LA|70607
14619|Smith's Mobile Home Park|6505 Nelson Road|Lake Charles|LA|70605
31372|Jesse James Mobile Home Park|2141 Country Club Road|Lake Charles|LA|70605
14652|Blankenship Mobile Home Park|3382 L Benoit Road|Lake Charles|LA|70605
38723|Lake City Homes|2408 East Broad St|Lake Charles|LA|70601
55501|Rutherford Mobile Parks|3031 Highway 14 E|Lake Charles|LA|70607
14557|Sportsman Mobile Home Park|2653 Old Deridder Highway|Lake Charles|LA|70615
14416|Dove Creek Mobile Home Park|3200 Westwood Road|Westlake|LA|70669
14394|Country Estates Mobile Home Park|205 Westside Drive|Vidalia|LA|71373
75895|Satsuma Heights Mobile Home Park|12398 Florida Blvd|Livingston|LA|70754
106308|Loranger MHP|19364 Louisiana 442|Loranger|LA|70446
14374|Chahta Mobile Home Park|1101 Colbert Street|Mandeville|LA|70448
98391|Mouser's Home Place|105 Mandy Ln|Minden|LA|71055
29994|Hallmark Village|12397 Highway 80|Minden|LA|71055
14535|Robertson Mobile Home Park|200 Robertson Drive|Minden|LA|71055
55498|Southfield Mh Park|11971 Highway 80|Minden|LA|71055
130577|165 Mobile Home & RV Park|5000 Hwy 165 South|Monroe|LA|71201
14395|Country Living Mobile Home Park|505 North 17th Street|Monroe|LA|71201
128370|Lakeview Mobile Home Park|610 Caddo Lease Road|Mooringsport|LA|71060
97353|Angelina MHP|6530 Highway 1|Shreveport|LA|71107
14400|Countryaire Mobile Home Park|7410 Old Mooringsport Road|Shreveport|LA|71107
14352|Blanchard Mobile Home Villa|107 Blanchard Mobile Villa Road|Shreveport|LA|71107
33880|Deer Creek|8310 Dixie Blanchard Road|Shreveport|LA|71107
14453|Hillside Mobile Home Park|6941 Highway 1|Shreveport|LA|71107
14370|Sunset Mobile Home Park|6605 Sunset Park|Shreveport|LA|71107
14655|Evergreen Estates|5280 Old Mooringsport Road|Shreveport|LA|71107
28936|Cypress Garden Mobile Home Park|Cypress Garden|Shreveport|LA|71106
14326|Alpha Mobile Home Park|433 Flournoy Lucas Road|Shreveport|LA|71106
14315|Lakewood Village Mobile Home Park|9110 Linwood Avenue|Shreveport|LA|71106
55433|Alpine Mobile Estates|7864 Edelweiss Dr|Shreveport|LA|71107
28558|Lin Park|324 Idema Street|Shreveport|LA|71106
14669|Majorias Many Trees|5110 Ames Boulevard|Marrero|LA|70072
14672|Oak Park II|4868 Orleans Way|Marrero|LA|70072
31215|Sievers Trailer Court|3400 Ames Boulevard|Marrero|LA|70072
14550|Andrus Mobile Home Park|5225 August Lane|Marrero|LA|70072
31214|Breaux Mobile Home Park|4137 Ames Boulevard|Marrero|LA|70072
14468|Justice Trailer Court|5728 4th Street|Marrero|LA|70072
32875|H & D Mobile Home Park|5926 4th Street|Marrero|LA|70072
84901|Easy Living MHP|22821 Highway 22|Maurepas|LA|70449
32601|Fusilier Mobile Home Estates|8899 Fusilier Road|Maurice|LA|70555
73978|Mallard Point Mobile Home Park|42298 Highway 933|Prairieville|LA|70769
28850|Prairie Oaks Mobile Home Park|42385 Moody Dixon Drive|Prairieville|LA|70769
31267|Raybons Village|17091 East Swamp Road|Prairieville|LA|70769
31326|Shady Oaks Mobile Home Park|43264 Moody Dixon|Prairieville|LA|70769
27896|Landry's Mobile Home Park|17140 Highway 44|Prairieville|LA|70769
128028|Community Oaks MHC|42057 Moody Dixon Road|Prairieville|LA|70769
31246|Comeaux Mobile Park|37113 White Road|Prairieville|LA|70769
14612|Crystal Place|15260 East Beaver Drive|Pride|LA|70770
72631|Joor Road Mobile Home Park|14853 Joor Road|Zachary|LA|70791
74136|North Corbin Mobile Home Community|35081 North Corbin Rd|Walker|LA|70785
14640|Oak Alley Estates|280 Mt Pleasant Road|Zachary|LA|70791
27893|Sweet Briar Mobile Home Park|18733 Samuels Road|Zachary|LA|70791
14415|Doss Wheeler Mobile Home Park|5157 Highway 19|Zachary|LA|70791
31266|Town & Country Mobile Home Village|6401 Main Street|Zachary|LA|70791
14485|Messer Mobile Home Park|64105 Highway 3081|Pearl River|LA|70452
14575|Twin Oaks Mobile Manor|64371 Highway 3081|Pearl River|LA|70452
14525|Court Street Estates|1590 Court Street|Port Allen|LA|70767
78842|Hidden Oaks Mobile Home Community|7300 Rougon Road|Port Allen|LA|70767
14345|Belle Vale Mobile Home Park|2850 Hwy 190 W|Port Allen|LA|70767
14675|Plantation Mobile Home Park|2960 Highway 190 West|Port Allen|LA|70767
55484|B & K Mobile Park|2553 Court St|Port Allen|LA|70767
14419|Dude's Trailer Park|1534 Highway 190 West|Port Allen|LA|70767
14668|Bobby Lejeune Mobile Home Park|Virginia Elizabeth Ave|Port Barre|LA|70577
14608|St Amant Trailer Park|13128 Lamar Moran Road|Saint Amant|LA|70774
55443|Southern Mh Park|44416 Gold Place Rd|Saint Amant|LA|70774
72669|Riverside Mobile Home Park|22210 Warren Street|Plaquemine|LA|70764
14381|Choctaw Mobile Home Park|59655 Highway 1148|Plaquemine|LA|70764
29760|Seneca Park|57785 Seneca Park|Plaquemine|LA|70764
14607|La Bon Via|22210 Warren Street|Plaquemine|LA|70764
110775|Strawberry Holdings|700 W Mcclellan St|Ponchatoula|LA|70454
55485|Pretty Acres Mh Park|18230 Rose Dr Trlr 15|Ponchatoula|LA|70454
37678|Greenleaf Mobile Home Park|4587 East Highway 80|Ruston|LA|71270
55463|Lakeview Mobile Home Park|1501 Atkins Rd|Ruston|LA|71270
76550|Sheppard Creek Mobile Home Park|110 Ruger Lane|Ruston|LA|71270
14581|Village Green Mobile Home Park|196 Sundance Dr|Ruston|LA|71270
14502|North Village Mobile Home Park|150 N Village Dr|Ruston|LA|71270
55482|Augustine Mh Park|617 Jackson Ave|Ruston|LA|71270
55481|Cedar Creek Mh Park|2001 W Alabama Ave|Ruston|LA|71270
55480|Country Living Mh Park|6870 Highway 80|Ruston|LA|71270
55462|Evans Mobile Home Park|4399 Highway 818|Ruston|LA|71270
55461|Garner Clark Mh Park|128 Sandbed Rd|Ruston|LA|71270
55460|Green Acres Mobile Park|203 Water Tank Rd|Ruston|LA|71270
55458|Green Oaks Mh Park|2460 W Alabama Ave|Ruston|LA|71270
55457|Hays Mobile Home Park|200 Riser Rd|Ruston|LA|71270
55455|Highland Mobile Home Park|1301 Highland St|Ruston|LA|71270
55454|Lars Gray Mobile Home Park|137 Penny Ln|Ruston|LA|71270
55453|Lays Mobile Home Park|400 W Louisiana Ave|Ruston|LA|71270
55452|Leisure Living Mh Park|3001 Beacon Light Rd|Ruston|LA|71270
55451|Liners Mobile Home Park|4302 Highway 80|Ruston|LA|71270
55450|Milton Candler Mh Park|133 Sandbed Rd|Ruston|LA|71270
55449|Oakhill Mobile Home Park|269 Dunn Rd|Ruston|LA|71270
14513|Peachland Village|7003 Highway 80|Ruston|LA|71270
55448|Penn Oaks Mh Park|2703 W California Ave|Ruston|LA|71270
14574|Town & Country Village|696 Burgessville Road|Ruston|LA|71270
14587|Westwood Hills Mobile Home Park|3300 Fletcher Lane|Ruston|LA|71270
55447|Shady Lane Mh Park|1423 Mcallister St|Ruston|LA|71270
55446|Tall Timbers Mh Park|1343 Frazier Rd|Ruston|LA|71270
55445|University Hill Mh Park|1609 W California Ave|Ruston|LA|71270
55444|Wilson Mobile Home Park|890 Rough Edge Rd|Ruston|LA|71270
126678|Steve's Mobile Home Park|229 Horne Lane|West Monroe|LA|71292
14399|Country Village Mobile Home Park|3100 Arkansas Road|West Monroe|LA|71291
14600|Forest Village Mobile Home Park|220 Forest Drive|West Monroe|LA|71291
14554|Southern Living Village|7990 Cypress Street|West Monroe|LA|71291
14364|Canaan Land Mobile Home Park|2809 Arkansas Road|West Monroe|LA|71291
39935|Timberwood Estates|1961 New Natchitoches Road|West Monroe|LA|71291
14386|Claiborne Hills Mobile Home Park|5802 Cypress Street|West Monroe|LA|71291
43520|Hillside Mobile Home Park|1135 Wallace Drive|West Monroe|LA|71291
31265|Pecan Acres Mobile Home Park|1925 Highway 15|West Monroe|LA|71291
14533|River City Mobile Homes|4700 Cypress Street|West Monroe|LA|71291
55409|Sullivan Mobile Home Park|157 Poor Boy Ln|West Monroe|LA|71292
88783|Luxury Living Mobile Home Park|401 D Arceneaux Rd.|Scott|LA|70583
31856|Mills Estates|204 Mills Street|Scott|LA|70583
14526|Potpourri Village|1000 Renaud Drive|Scott|LA|70583
14665|Westgate Mobile Home Park|3750 Landry Road|Scott|LA|70583
130311|Acadiana Coastal MHP|6209 Cameron St|Scott|LA|70583
84755|Des Jacques Park|231 Des Jacques Rd.|Scott|LA|70583
14543|Shiloh MHC|1111 Roper Rd|Scott|LA|70583
14406|Cypress Mobile Estates|1312 Roper Drive|Scott|LA|70583
14442|Countryside MHP|440 Heide Circle|Scott|LA|70583
14626|Cozy Acres Mobile Home Park|304 Rue Septembre|Scott|LA|70583
14472|Landall Mobile Estates|2900 West Willow Street|Scott|LA|70583
55441|Chester Domingue Mh Park|116 Fenetre Rd|Scott|LA|70583
14437|G & R Mobile Park|307 Pecan Grove Road|Scott|LA|70583
33365|Hebert Mobile Home Park|108 Rekha Drive|Scott|LA|70583
55438|Lantier Mh Park|120 Dronet St|Scott|LA|70583
55435|Thibodeaux Mh Park|1402 Saint Marry St|Scott|LA|70583
55434|Warren Landry Mh Park|3105 W Willow St|Scott|LA|70583
37620|Hebert's Mobile Home Park|1184 Hebert Lane|Saint Martinville|LA|70582
128454|North Side Trailer Park|104 Willis Dr|Saint Martinville|LA|70582
106510|Rose Pine MHC|Smede Highway|Saint Martinville|LA|70582
85275|La Pacaniere MHP|5579 Resweber Highway|Saint Martinville|LA|70582
42294|Sandy's Trailer Park|1022 Bayou Alexander Highway|Saint Martinville|LA|70582
67422|Pioneer Park|Pioneer Trailer Park Road|Saint Francisville|LA|70775
14531|Ricks Trailer Park|9762 Highway 965|Saint Francisville|LA|70775
14662|Riverland Mobile Home Park|Bonura Drive|Saint Rose|LA|70087
14651|Fanz Mobile Home Park|2100 W. Fanz|Saint Bernard|LA|70085
33954|Sideline Mobile Home Park|24 Randazzo Drive|Saint Bernard|LA|70085
14384|Circle West Mobile Homes Estates|200 Circle West Drive|Westwego|LA|70094
32618|Shady Pines Mobile Home Park|59275 Shady Lane|Slidell|LA|70460
14559|Eagle Lake Mobile Home Park|1210 Eagle Lake Boulevard|Slidell|LA|70460
14566|Tammany Mobile Home Park|41662 Highway 190 East|Slidell|LA|70461
14555|Southern Manor Mobile Home Park Inc|60375 North Military Road|Slidell|LA|70458
14316|Dream Courts Mobile Home Park|217 Dream Court|Slidell|LA|70461
14391|Country Club Mobile Home Park|144 Rainey Road|Slidell|LA|70458
14519|Pine Crest Mobile Home Park|2601 Old Spanish Trail|Slidell|LA|70461
28405|Jim's Mobile Home Park|29906 Highway 22|Springfield|LA|70462
125772|Hidden Point Homes|27848 Frindik Ln|Springfield|LA|70462
37527|South Stonewall Mobile Estates|108 R.v. Lane|Stonewall|LA|71078
14367|Sweet Gum Community|4314 Highway 27 South|Sulphur|LA|70665
43498|Twin Oaks|3550 Carlyss Drive|Sulphur|LA|70665
74671|Brimstone|940 Kirby Street|Sulphur|LA|70663
14674|Cumberland Estates|1122 West Verdine Street|Sulphur|LA|70663
40678|B B Trailer Park|430 Post Oak Road|Sulphur|LA|70663
14631|Bayou Country Villa|1207 Ravia Road|Sulphur|LA|70665
14601|Acadian Acres Mobile Home Park|2211 Patton Street|Sulphur|LA|70665
14339|Barton's RV Park|1108 South Post Oak Road|Sulphur|LA|70663
14495|Mount Dale B Mobile Home Park|777 Invader Street|Sulphur|LA|70663
14497|Mylander Mobile Home Park|1216 South Post Oak Road|Sulphur|LA|70663
128034|Youngsville Estates MHC|728 Young Street|Youngsville|LA|70592
14363|Cajun Mobile Home Park|215 Gireer Road|Youngsville|LA|70592
14654|Lakeview Mobile Home Park|450 Espasie Road|Youngsville|LA|70592
28570|T & M Mobile Home Park|102 Florine Street|Youngsville|LA|70592
40609|Carolyn's Trailer Park|49017 Stafford Road|Tickfaw|LA|70466
33510|Superior Mobile Home Park|14145 Old Gennessee Road|Tickfaw|LA|70466
31268|Whiskey Lane Mobile Home Park|49452 Whiskey Lane|Tickfaw|LA|70466
27892|Cronin Mobile Home Park|Cronin Lane|Venice|LA|70091
31636|Ted Davis Mobile Home Park|14186 Patin Dyke Road|Ventress|LA|70783
41045|Pecan Acres|1167 Pecan Acres Ln|Vidalia|LA|71373
29696|Tundra Estates|Howard Lane|Vidalia|LA|71373
52224|Glen Meadows Park|291 Holly Circle|Vinton|LA|70668
82751|Village North MHP|1520 N Pine St.|Vivian|LA|71082
14359|Palmetto Mobile Home Park|29686 South Palmetto Street|Walker|LA|70785
14547|Pleasant Oaks Mobile Home Park|11482 Florida Boulevard|Walker|LA|70785
14348|Big D Mobile Home Park & Rental|9673 Florida Boulevard|Walker|LA|70785
28822|Frank Cowart's Park|7057 Prairie Park|Winnsboro|LA|71295
14445|Green Acres Trailer Park|123 Highway 135|Rayville|LA|71269
81911|Lake View MHP|1107 Rene Rd|Farmerville|LA|71241
28443|Lakeside Mobile Home Park|571 North Spillway Road|Farmerville|LA|71241
14586|West Street Trailer Park|501 Miller Street|Farmerville|LA|71241
29806|Shady Acres Mobile Home Park|Shady Loop|Eunice|LA|70535
14432|F & F Mobile Home Park|1048 Samuel Drive|Eunice|LA|70535
14384|Circle West Mobile Homes Estates|200 Circle West Drive|Westwego|LA|70094
55426|Billy Barnes Mh Park|297 Rose St|Simsboro|LA|71275
14662|Riverland Mobile Home Park|Bonura Drive|Saint Rose|LA|70087
125710|Park Longacre|760 Hwy 384|Lake Charles|LA|70607
14557|Sportsman Mobile Home Park|2653 Old Deridder Highway|Lake Charles|LA|70615
14556|The Charleston MHC|5000 Leon Drive|Lake Charles|LA|70605
97901|Willow Ridge Mhp|1855 Red Davis Mccollister Rd|Lake Charles|LA|70607
14619|Smith's Mobile Home Park|6505 Nelson Road|Lake Charles|LA|70605
31372|Jesse James Mobile Home Park|2141 Country Club Road|Lake Charles|LA|70605
14652|Blankenship Mobile Home Park|3382 L Benoit Road|Lake Charles|LA|70605
38723|Lake City Homes|2408 East Broad St|Lake Charles|LA|70601
55501|Rutherford Mobile Parks|3031 Highway 14 E|Lake Charles|LA|70607
81911|Lake View MHP|1107 Rene Rd|Farmerville|LA|71241
14623|Grays Mobile Home Park|1506 Grays Park Lane|Florien|LA|71429
55501|Rutherford Mobile Parks|3031 Highway 14 E|Lake Charles|LA|70607
14341|Bayou Shades Mobile Village|2224 Old Highway 171 North|Lake Charles|LA|70615
28768|Grandview Mobile Estates|115 Highland Drive|Kinder|LA|70648
14460|I-10 Mobile Village|583 I-10 Mobile Village Road|Lake Charles|LA|70615
14465|James Mobile Home Park|6336 East Opelousas Street|Lake Charles|LA|70615
14426|Crestwood Community|5711 Broad Street|Lake Charles|LA|70615
14394|Country Estates Mobile Home Park|205 Westside Drive|Vidalia|LA|71373
55666|Raccourici Park|5162 La Highway 419|Batchelor|LA|70715
14444|Granberrys Mobile Home Park|4250 Blount Road|Baton Rouge|LA|70807
"""

def main():
    parks = {}  # keyed by park_id to deduplicate

    for line in RAW_DATA.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        parts = line.split('|')
        if len(parts) != 6:
            continue

        park_id, name, address, city, state, zipcode = [p.strip() for p in parts]

        # Filter to Louisiana only
        if state != 'LA':
            continue

        # Skip if park_id is not numeric
        if not park_id.isdigit():
            continue

        # Deduplicate by park_id (first occurrence wins)
        if park_id not in parks:
            parks[park_id] = {
                'park_id': park_id,
                'name': name,
                'address': address,
                'city': city,
                'state': state,
                'zip': zipcode
            }

    # Write CSV
    output_path = '/Users/gallagherpropertycompany/Documents/gallagher-cres/scripts/mhp-scrape/la_mobile_home_parks.csv'
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['park_id', 'name', 'address', 'city', 'state', 'zip'])
        writer.writeheader()
        for park_id in sorted(parks.keys(), key=int):
            writer.writerow(parks[park_id])

    print(f"Total unique Louisiana parks: {len(parks)}")
    print(f"Written to: {output_path}")

    # Also print park IDs for Phase 2 detail scraping
    ids = sorted(parks.keys(), key=int)
    print(f"\nPark IDs for detail scraping ({len(ids)} total):")
    print(','.join(ids))

if __name__ == '__main__':
    main()
