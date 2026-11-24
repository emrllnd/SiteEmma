/* =========================================================
   EMMA — produits skincare de départ
   Chaque produit listé ici est ajouté une seule fois à la routine
   (s'il est supprimé dans le site, il ne revient pas).

   Format d'un produit :
   {
     id: "identifiant-unique",          // ne jamais le changer une fois ajouté
     name: "Sérum vitamine C",
     brand: "Marque",
     ref: "Référence exacte",
     type: "serum",                     // voir SKIN_TYPES dans skincare.js
     am: true,                          // matin
     pm: false,                         // soir
     days: [0, 1, 2, 3, 4, 5, 6],       // 0 = lundi … 6 = dimanche
     notes: "2 gouttes"
   }
   ========================================================= */

const SKINCARE_PRODUITS = [
];
