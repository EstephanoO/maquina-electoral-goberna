-- ============================================================
-- Populate geographic names for Peru administrative divisions
-- Source: INEI (Instituto Nacional de Estadística e Informática)
-- Official UBIGEO codes and names for Peru
-- ============================================================

BEGIN;

-- ── DEPARTAMENTOS (25) ──
-- Already populated via direct UPDATE, verify:
-- SELECT coddep, nomdep FROM peru_departamentos ORDER BY coddep;

-- ── PROVINCIAS (196) ──
-- Format: UPDATE WHERE coddep='XX' AND codprov='YY'

-- 01 AMAZONAS
UPDATE peru_provincias SET nomprov='CHACHAPOYAS' WHERE coddep='01' AND codprov='01';
UPDATE peru_provincias SET nomprov='BAGUA' WHERE coddep='01' AND codprov='02';
UPDATE peru_provincias SET nomprov='BONGARA' WHERE coddep='01' AND codprov='03';
UPDATE peru_provincias SET nomprov='CONDORCANQUI' WHERE coddep='01' AND codprov='04';
UPDATE peru_provincias SET nomprov='LUYA' WHERE coddep='01' AND codprov='05';
UPDATE peru_provincias SET nomprov='RODRIGUEZ DE MENDOZA' WHERE coddep='01' AND codprov='06';
UPDATE peru_provincias SET nomprov='UTCUBAMBA' WHERE coddep='01' AND codprov='07';

-- 02 ANCASH
UPDATE peru_provincias SET nomprov='HUARAZ' WHERE coddep='02' AND codprov='01';
UPDATE peru_provincias SET nomprov='AIJA' WHERE coddep='02' AND codprov='02';
UPDATE peru_provincias SET nomprov='ANTONIO RAYMONDI' WHERE coddep='02' AND codprov='03';
UPDATE peru_provincias SET nomprov='ASUNCION' WHERE coddep='02' AND codprov='04';
UPDATE peru_provincias SET nomprov='BOLOGNESI' WHERE coddep='02' AND codprov='05';
UPDATE peru_provincias SET nomprov='CARHUAZ' WHERE coddep='02' AND codprov='06';
UPDATE peru_provincias SET nomprov='CARLOS FERMIN FITZCARRALD' WHERE coddep='02' AND codprov='07';
UPDATE peru_provincias SET nomprov='CASMA' WHERE coddep='02' AND codprov='08';
UPDATE peru_provincias SET nomprov='CORONGO' WHERE coddep='02' AND codprov='09';
UPDATE peru_provincias SET nomprov='HUARI' WHERE coddep='02' AND codprov='10';
UPDATE peru_provincias SET nomprov='HUARMEY' WHERE coddep='02' AND codprov='11';
UPDATE peru_provincias SET nomprov='HUAYLAS' WHERE coddep='02' AND codprov='12';
UPDATE peru_provincias SET nomprov='MARISCAL LUZURIAGA' WHERE coddep='02' AND codprov='13';
UPDATE peru_provincias SET nomprov='OCROS' WHERE coddep='02' AND codprov='14';
UPDATE peru_provincias SET nomprov='PALLASCA' WHERE coddep='02' AND codprov='15';
UPDATE peru_provincias SET nomprov='POMABAMBA' WHERE coddep='02' AND codprov='16';
UPDATE peru_provincias SET nomprov='RECUAY' WHERE coddep='02' AND codprov='17';
UPDATE peru_provincias SET nomprov='SANTA' WHERE coddep='02' AND codprov='18';
UPDATE peru_provincias SET nomprov='SIHUAS' WHERE coddep='02' AND codprov='19';
UPDATE peru_provincias SET nomprov='YUNGAY' WHERE coddep='02' AND codprov='20';

-- 03 APURIMAC
UPDATE peru_provincias SET nomprov='ABANCAY' WHERE coddep='03' AND codprov='01';
UPDATE peru_provincias SET nomprov='ANDAHUAYLAS' WHERE coddep='03' AND codprov='02';
UPDATE peru_provincias SET nomprov='ANTABAMBA' WHERE coddep='03' AND codprov='03';
UPDATE peru_provincias SET nomprov='AYMARAES' WHERE coddep='03' AND codprov='04';
UPDATE peru_provincias SET nomprov='COTABAMBAS' WHERE coddep='03' AND codprov='05';
UPDATE peru_provincias SET nomprov='CHINCHEROS' WHERE coddep='03' AND codprov='06';
UPDATE peru_provincias SET nomprov='GRAU' WHERE coddep='03' AND codprov='07';

-- 04 AREQUIPA
UPDATE peru_provincias SET nomprov='AREQUIPA' WHERE coddep='04' AND codprov='01';
UPDATE peru_provincias SET nomprov='CAMANA' WHERE coddep='04' AND codprov='02';
UPDATE peru_provincias SET nomprov='CARAVELI' WHERE coddep='04' AND codprov='03';
UPDATE peru_provincias SET nomprov='CASTILLA' WHERE coddep='04' AND codprov='04';
UPDATE peru_provincias SET nomprov='CAYLLOMA' WHERE coddep='04' AND codprov='05';
UPDATE peru_provincias SET nomprov='CONDESUYOS' WHERE coddep='04' AND codprov='06';
UPDATE peru_provincias SET nomprov='ISLAY' WHERE coddep='04' AND codprov='07';
UPDATE peru_provincias SET nomprov='LA UNION' WHERE coddep='04' AND codprov='08';

-- 05 AYACUCHO
UPDATE peru_provincias SET nomprov='HUAMANGA' WHERE coddep='05' AND codprov='01';
UPDATE peru_provincias SET nomprov='CANGALLO' WHERE coddep='05' AND codprov='02';
UPDATE peru_provincias SET nomprov='HUANCA SANCOS' WHERE coddep='05' AND codprov='03';
UPDATE peru_provincias SET nomprov='HUANTA' WHERE coddep='05' AND codprov='04';
UPDATE peru_provincias SET nomprov='LA MAR' WHERE coddep='05' AND codprov='05';
UPDATE peru_provincias SET nomprov='LUCANAS' WHERE coddep='05' AND codprov='06';
UPDATE peru_provincias SET nomprov='PARINACOCHAS' WHERE coddep='05' AND codprov='07';
UPDATE peru_provincias SET nomprov='PAUCAR DEL SARA SARA' WHERE coddep='05' AND codprov='08';
UPDATE peru_provincias SET nomprov='SUCRE' WHERE coddep='05' AND codprov='09';
UPDATE peru_provincias SET nomprov='VICTOR FAJARDO' WHERE coddep='05' AND codprov='10';
UPDATE peru_provincias SET nomprov='VILCAS HUAMAN' WHERE coddep='05' AND codprov='11';

-- 06 CAJAMARCA
UPDATE peru_provincias SET nomprov='CAJAMARCA' WHERE coddep='06' AND codprov='01';
UPDATE peru_provincias SET nomprov='CAJABAMBA' WHERE coddep='06' AND codprov='02';
UPDATE peru_provincias SET nomprov='CELENDIN' WHERE coddep='06' AND codprov='03';
UPDATE peru_provincias SET nomprov='CHOTA' WHERE coddep='06' AND codprov='04';
UPDATE peru_provincias SET nomprov='CONTUMAZA' WHERE coddep='06' AND codprov='05';
UPDATE peru_provincias SET nomprov='CUTERVO' WHERE coddep='06' AND codprov='06';
UPDATE peru_provincias SET nomprov='HUALGAYOC' WHERE coddep='06' AND codprov='07';
UPDATE peru_provincias SET nomprov='JAEN' WHERE coddep='06' AND codprov='08';
UPDATE peru_provincias SET nomprov='SAN IGNACIO' WHERE coddep='06' AND codprov='09';
UPDATE peru_provincias SET nomprov='SAN MARCOS' WHERE coddep='06' AND codprov='10';
UPDATE peru_provincias SET nomprov='SAN MIGUEL' WHERE coddep='06' AND codprov='11';
UPDATE peru_provincias SET nomprov='SAN PABLO' WHERE coddep='06' AND codprov='12';
UPDATE peru_provincias SET nomprov='SANTA CRUZ' WHERE coddep='06' AND codprov='13';

-- 07 CALLAO
UPDATE peru_provincias SET nomprov='CALLAO' WHERE coddep='07' AND codprov='01';

-- 08 CUSCO
UPDATE peru_provincias SET nomprov='CUSCO' WHERE coddep='08' AND codprov='01';
UPDATE peru_provincias SET nomprov='ACOMAYO' WHERE coddep='08' AND codprov='02';
UPDATE peru_provincias SET nomprov='ANTA' WHERE coddep='08' AND codprov='03';
UPDATE peru_provincias SET nomprov='CALCA' WHERE coddep='08' AND codprov='04';
UPDATE peru_provincias SET nomprov='CANAS' WHERE coddep='08' AND codprov='05';
UPDATE peru_provincias SET nomprov='CANCHIS' WHERE coddep='08' AND codprov='06';
UPDATE peru_provincias SET nomprov='CHUMBIVILCAS' WHERE coddep='08' AND codprov='07';
UPDATE peru_provincias SET nomprov='ESPINAR' WHERE coddep='08' AND codprov='08';
UPDATE peru_provincias SET nomprov='LA CONVENCION' WHERE coddep='08' AND codprov='09';
UPDATE peru_provincias SET nomprov='PARURO' WHERE coddep='08' AND codprov='10';
UPDATE peru_provincias SET nomprov='PAUCARTAMBO' WHERE coddep='08' AND codprov='11';
UPDATE peru_provincias SET nomprov='QUISPICANCHI' WHERE coddep='08' AND codprov='12';
UPDATE peru_provincias SET nomprov='URUBAMBA' WHERE coddep='08' AND codprov='13';

-- 09 HUANCAVELICA
UPDATE peru_provincias SET nomprov='HUANCAVELICA' WHERE coddep='09' AND codprov='01';
UPDATE peru_provincias SET nomprov='ACOBAMBA' WHERE coddep='09' AND codprov='02';
UPDATE peru_provincias SET nomprov='ANGARAES' WHERE coddep='09' AND codprov='03';
UPDATE peru_provincias SET nomprov='CASTROVIRREYNA' WHERE coddep='09' AND codprov='04';
UPDATE peru_provincias SET nomprov='CHURCAMPA' WHERE coddep='09' AND codprov='05';
UPDATE peru_provincias SET nomprov='HUAYTARA' WHERE coddep='09' AND codprov='06';
UPDATE peru_provincias SET nomprov='TAYACAJA' WHERE coddep='09' AND codprov='07';

-- 10 HUANUCO
UPDATE peru_provincias SET nomprov='HUANUCO' WHERE coddep='10' AND codprov='01';
UPDATE peru_provincias SET nomprov='AMBO' WHERE coddep='10' AND codprov='02';
UPDATE peru_provincias SET nomprov='DOS DE MAYO' WHERE coddep='10' AND codprov='03';
UPDATE peru_provincias SET nomprov='HUACAYBAMBA' WHERE coddep='10' AND codprov='04';
UPDATE peru_provincias SET nomprov='HUAMALIES' WHERE coddep='10' AND codprov='05';
UPDATE peru_provincias SET nomprov='LEONCIO PRADO' WHERE coddep='10' AND codprov='06';
UPDATE peru_provincias SET nomprov='MARAÑON' WHERE coddep='10' AND codprov='07';
UPDATE peru_provincias SET nomprov='PACHITEA' WHERE coddep='10' AND codprov='08';
UPDATE peru_provincias SET nomprov='PUERTO INCA' WHERE coddep='10' AND codprov='09';
UPDATE peru_provincias SET nomprov='LAURICOCHA' WHERE coddep='10' AND codprov='10';
UPDATE peru_provincias SET nomprov='YAROWILCA' WHERE coddep='10' AND codprov='11';

-- 11 ICA
UPDATE peru_provincias SET nomprov='ICA' WHERE coddep='11' AND codprov='01';
UPDATE peru_provincias SET nomprov='CHINCHA' WHERE coddep='11' AND codprov='02';
UPDATE peru_provincias SET nomprov='NAZCA' WHERE coddep='11' AND codprov='03';
UPDATE peru_provincias SET nomprov='PALPA' WHERE coddep='11' AND codprov='04';
UPDATE peru_provincias SET nomprov='PISCO' WHERE coddep='11' AND codprov='05';

-- 12 JUNIN
UPDATE peru_provincias SET nomprov='HUANCAYO' WHERE coddep='12' AND codprov='01';
UPDATE peru_provincias SET nomprov='CONCEPCION' WHERE coddep='12' AND codprov='02';
UPDATE peru_provincias SET nomprov='CHANCHAMAYO' WHERE coddep='12' AND codprov='03';
UPDATE peru_provincias SET nomprov='JAUJA' WHERE coddep='12' AND codprov='04';
UPDATE peru_provincias SET nomprov='JUNIN' WHERE coddep='12' AND codprov='05';
UPDATE peru_provincias SET nomprov='SATIPO' WHERE coddep='12' AND codprov='06';
UPDATE peru_provincias SET nomprov='TARMA' WHERE coddep='12' AND codprov='07';
UPDATE peru_provincias SET nomprov='YAULI' WHERE coddep='12' AND codprov='08';
UPDATE peru_provincias SET nomprov='CHUPACA' WHERE coddep='12' AND codprov='09';

-- 13 LA LIBERTAD
UPDATE peru_provincias SET nomprov='TRUJILLO' WHERE coddep='13' AND codprov='01';
UPDATE peru_provincias SET nomprov='ASCOPE' WHERE coddep='13' AND codprov='02';
UPDATE peru_provincias SET nomprov='BOLIVAR' WHERE coddep='13' AND codprov='03';
UPDATE peru_provincias SET nomprov='CHEPEN' WHERE coddep='13' AND codprov='04';
UPDATE peru_provincias SET nomprov='JULCAN' WHERE coddep='13' AND codprov='05';
UPDATE peru_provincias SET nomprov='OTUZCO' WHERE coddep='13' AND codprov='06';
UPDATE peru_provincias SET nomprov='PACASMAYO' WHERE coddep='13' AND codprov='07';
UPDATE peru_provincias SET nomprov='PATAZ' WHERE coddep='13' AND codprov='08';
UPDATE peru_provincias SET nomprov='SANCHEZ CARRION' WHERE coddep='13' AND codprov='09';
UPDATE peru_provincias SET nomprov='SANTIAGO DE CHUCO' WHERE coddep='13' AND codprov='10';
UPDATE peru_provincias SET nomprov='GRAN CHIMU' WHERE coddep='13' AND codprov='11';
UPDATE peru_provincias SET nomprov='VIRU' WHERE coddep='13' AND codprov='12';

-- 14 LAMBAYEQUE
UPDATE peru_provincias SET nomprov='CHICLAYO' WHERE coddep='14' AND codprov='01';
UPDATE peru_provincias SET nomprov='FERREÑAFE' WHERE coddep='14' AND codprov='02';
UPDATE peru_provincias SET nomprov='LAMBAYEQUE' WHERE coddep='14' AND codprov='03';

-- 15 LIMA
UPDATE peru_provincias SET nomprov='LIMA' WHERE coddep='15' AND codprov='01';
UPDATE peru_provincias SET nomprov='BARRANCA' WHERE coddep='15' AND codprov='02';
UPDATE peru_provincias SET nomprov='CAJATAMBO' WHERE coddep='15' AND codprov='03';
UPDATE peru_provincias SET nomprov='CANTA' WHERE coddep='15' AND codprov='04';
UPDATE peru_provincias SET nomprov='CAÑETE' WHERE coddep='15' AND codprov='05';
UPDATE peru_provincias SET nomprov='HUARAL' WHERE coddep='15' AND codprov='06';
UPDATE peru_provincias SET nomprov='HUAROCHIRI' WHERE coddep='15' AND codprov='07';
UPDATE peru_provincias SET nomprov='HUAURA' WHERE coddep='15' AND codprov='08';
UPDATE peru_provincias SET nomprov='OYON' WHERE coddep='15' AND codprov='09';
UPDATE peru_provincias SET nomprov='YAUYOS' WHERE coddep='15' AND codprov='10';

-- 16 LORETO
UPDATE peru_provincias SET nomprov='MAYNAS' WHERE coddep='16' AND codprov='01';
UPDATE peru_provincias SET nomprov='ALTO AMAZONAS' WHERE coddep='16' AND codprov='02';
UPDATE peru_provincias SET nomprov='LORETO' WHERE coddep='16' AND codprov='03';
UPDATE peru_provincias SET nomprov='MARISCAL RAMON CASTILLA' WHERE coddep='16' AND codprov='04';
UPDATE peru_provincias SET nomprov='REQUENA' WHERE coddep='16' AND codprov='05';
UPDATE peru_provincias SET nomprov='UCAYALI' WHERE coddep='16' AND codprov='06';
UPDATE peru_provincias SET nomprov='DATEM DEL MARAÑON' WHERE coddep='16' AND codprov='07';
UPDATE peru_provincias SET nomprov='PUTUMAYO' WHERE coddep='16' AND codprov='08';

-- 17 MADRE DE DIOS
UPDATE peru_provincias SET nomprov='TAMBOPATA' WHERE coddep='17' AND codprov='01';
UPDATE peru_provincias SET nomprov='MANU' WHERE coddep='17' AND codprov='02';
UPDATE peru_provincias SET nomprov='TAHUAMANU' WHERE coddep='17' AND codprov='03';

-- 18 MOQUEGUA
UPDATE peru_provincias SET nomprov='MARISCAL NIETO' WHERE coddep='18' AND codprov='01';
UPDATE peru_provincias SET nomprov='GENERAL SANCHEZ CERRO' WHERE coddep='18' AND codprov='02';
UPDATE peru_provincias SET nomprov='ILO' WHERE coddep='18' AND codprov='03';

-- 19 PASCO
UPDATE peru_provincias SET nomprov='PASCO' WHERE coddep='19' AND codprov='01';
UPDATE peru_provincias SET nomprov='DANIEL ALCIDES CARRION' WHERE coddep='19' AND codprov='02';
UPDATE peru_provincias SET nomprov='OXAPAMPA' WHERE coddep='19' AND codprov='03';

-- 20 PIURA
UPDATE peru_provincias SET nomprov='PIURA' WHERE coddep='20' AND codprov='01';
UPDATE peru_provincias SET nomprov='AYABACA' WHERE coddep='20' AND codprov='02';
UPDATE peru_provincias SET nomprov='HUANCABAMBA' WHERE coddep='20' AND codprov='03';
UPDATE peru_provincias SET nomprov='MORROPON' WHERE coddep='20' AND codprov='04';
UPDATE peru_provincias SET nomprov='PAITA' WHERE coddep='20' AND codprov='05';
UPDATE peru_provincias SET nomprov='SULLANA' WHERE coddep='20' AND codprov='06';
UPDATE peru_provincias SET nomprov='TALARA' WHERE coddep='20' AND codprov='07';
UPDATE peru_provincias SET nomprov='SECHURA' WHERE coddep='20' AND codprov='08';

-- 21 PUNO
UPDATE peru_provincias SET nomprov='PUNO' WHERE coddep='21' AND codprov='01';
UPDATE peru_provincias SET nomprov='AZANGARO' WHERE coddep='21' AND codprov='02';
UPDATE peru_provincias SET nomprov='CARABAYA' WHERE coddep='21' AND codprov='03';
UPDATE peru_provincias SET nomprov='CHUCUITO' WHERE coddep='21' AND codprov='04';
UPDATE peru_provincias SET nomprov='EL COLLAO' WHERE coddep='21' AND codprov='05';
UPDATE peru_provincias SET nomprov='HUANCANE' WHERE coddep='21' AND codprov='06';
UPDATE peru_provincias SET nomprov='LAMPA' WHERE coddep='21' AND codprov='07';
UPDATE peru_provincias SET nomprov='MELGAR' WHERE coddep='21' AND codprov='08';
UPDATE peru_provincias SET nomprov='MOHO' WHERE coddep='21' AND codprov='09';
UPDATE peru_provincias SET nomprov='SAN ANTONIO DE PUTINA' WHERE coddep='21' AND codprov='10';
UPDATE peru_provincias SET nomprov='SAN ROMAN' WHERE coddep='21' AND codprov='11';
UPDATE peru_provincias SET nomprov='SANDIA' WHERE coddep='21' AND codprov='12';
UPDATE peru_provincias SET nomprov='YUNGUYO' WHERE coddep='21' AND codprov='13';

-- 22 SAN MARTIN
UPDATE peru_provincias SET nomprov='MOYOBAMBA' WHERE coddep='22' AND codprov='01';
UPDATE peru_provincias SET nomprov='BELLAVISTA' WHERE coddep='22' AND codprov='02';
UPDATE peru_provincias SET nomprov='EL DORADO' WHERE coddep='22' AND codprov='03';
UPDATE peru_provincias SET nomprov='HUALLAGA' WHERE coddep='22' AND codprov='04';
UPDATE peru_provincias SET nomprov='LAMAS' WHERE coddep='22' AND codprov='05';
UPDATE peru_provincias SET nomprov='MARISCAL CACERES' WHERE coddep='22' AND codprov='06';
UPDATE peru_provincias SET nomprov='PICOTA' WHERE coddep='22' AND codprov='07';
UPDATE peru_provincias SET nomprov='RIOJA' WHERE coddep='22' AND codprov='08';
UPDATE peru_provincias SET nomprov='SAN MARTIN' WHERE coddep='22' AND codprov='09';
UPDATE peru_provincias SET nomprov='TOCACHE' WHERE coddep='22' AND codprov='10';

-- 23 TACNA
UPDATE peru_provincias SET nomprov='TACNA' WHERE coddep='23' AND codprov='01';
UPDATE peru_provincias SET nomprov='CANDARAVE' WHERE coddep='23' AND codprov='02';
UPDATE peru_provincias SET nomprov='JORGE BASADRE' WHERE coddep='23' AND codprov='03';
UPDATE peru_provincias SET nomprov='TARATA' WHERE coddep='23' AND codprov='04';

-- 24 TUMBES
UPDATE peru_provincias SET nomprov='TUMBES' WHERE coddep='24' AND codprov='01';
UPDATE peru_provincias SET nomprov='CONTRALMIRANTE VILLAR' WHERE coddep='24' AND codprov='02';
UPDATE peru_provincias SET nomprov='ZARUMILLA' WHERE coddep='24' AND codprov='03';

-- 25 UCAYALI
UPDATE peru_provincias SET nomprov='CORONEL PORTILLO' WHERE coddep='25' AND codprov='01';
UPDATE peru_provincias SET nomprov='ATALAYA' WHERE coddep='25' AND codprov='02';
UPDATE peru_provincias SET nomprov='PADRE ABAD' WHERE coddep='25' AND codprov='03';
UPDATE peru_provincias SET nomprov='PURUS' WHERE coddep='25' AND codprov='04';

COMMIT;
