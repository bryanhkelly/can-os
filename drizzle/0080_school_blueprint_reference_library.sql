-- 0080: Controlled identity choices and reusable planning reference library.
-- A selected tradition is self-declared, NOT a verified network affiliation.
INSERT INTO religious_affiliation_options(code,label,group_code,parent_code,classification,sort_order) VALUES
('none','No religious affiliation','none',NULL,'unaffiliated',0),
('nonsectarian','Nonsectarian','none',NULL,'nonsectarian',10),
('interfaith','Interfaith / Multifaith','interfaith',NULL,'interfaith',20),
('christian','Christian','christian',NULL,'religious',30),
('christian.baptist','Baptist','christian','christian','religious',40),
('christian.cogic','Church of God in Christ (COGIC)','christian','christian','religious',50),
('christian.cogbf','Church of God by Faith (COGBF)','christian','christian','religious',60),
('christian.ame','African Methodist Episcopal (AME)','christian','christian','religious',70),
('christian.paw','Pentecostal Assemblies of the World (PAW)','christian','christian','religious',80),
('christian.pentecostal','Pentecostal','christian','christian','religious',90),
('christian.apostolic','Apostolic','christian','christian','religious',100),
('christian.catholic','Catholic','christian','christian','religious',110),
('christian.protestant','Other Protestant','christian','christian','religious',120),
('christian.nondenominational','Nondenominational Christian','christian','christian','religious',130),
('muslim','Muslim / Islamic','muslim',NULL,'religious',140),
('muslim.sunni','Sunni','muslim','muslim','religious',150),
('muslim.shia','Shia','muslim','muslim','religious',160),
('jewish','Jewish','jewish',NULL,'religious',170),
('jewish.orthodox','Orthodox Jewish','jewish','jewish','religious',180),
('jewish.conservative','Conservative Jewish','jewish','jewish','religious',190),
('jewish.reform','Reform Jewish','jewish','jewish','religious',200),
('hindu','Hindu','hindu',NULL,'religious',210),
('buddhist','Buddhist','buddhist',NULL,'religious',220),
('sikh','Sikh','sikh',NULL,'religious',230),
('other','Other / Self-describe','other',NULL,'religious',240)
ON CONFLICT(code) DO NOTHING;
