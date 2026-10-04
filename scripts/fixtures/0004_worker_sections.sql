ALTER TABLE `members` ADD `section` text CHECK (`section` IS NULL OR (`role` = 'worker' AND `section` IN ('Flightops','Fulops','CCA','Office & Support Staff')));
