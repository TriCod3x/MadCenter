const STORE_LOCATION = {
  name: "Madcenter Construção",
  address: "R. Airton Senna, 77 - José de Freitas/PI",
  city: "José de Freitas",
  state: "PI",
  lat: -4.760287,
  lng: -42.573777
};

const VEHICLE_TYPES = [
  { id: "moto", nome: "Moto", capacidade: 20, custoBase: 10, custoKm: 1.4, uso: "Entregas pequenas e urgentes" },
  { id: "caminhonete", nome: "Caminhonete", capacidade: 500, custoBase: 25, custoKm: 2.8, uso: "Entregas médias" },
  { id: "bau-leve", nome: "Caminhão baú leve", capacidade: 1500, custoBase: 60, custoKm: 4.3, uso: "Entregas protegidas" },
  { id: "tres-quartos", nome: "Caminhão 3/4", capacidade: 3000, custoBase: 95, custoKm: 5.9, uso: "Rotas de maior volume" },
  { id: "carroceria-aberta", nome: "Caminhão carroceria aberta", capacidade: 5000, custoBase: 130, custoKm: 7.0, uso: "Materiais volumosos" }
];

const MUNICIPIOS_COORDS = {
  "jose de freitas-pi": { nome: "José de Freitas", estado: "PI", lat: -4.760287, lng: -42.573777 },
  "teresina-pi": { nome: "Teresina", estado: "PI", lat: -5.0892, lng: -42.8016 },
  "caxias-ma": { nome: "Caxias", estado: "MA", lat: -4.8589, lng: -43.3561 },
  "codo-ma": { nome: "Codó", estado: "MA", lat: -4.4556, lng: -43.8924 },
  "campo maior-pi": { nome: "Campo Maior", estado: "PI", lat: -4.8278, lng: -42.1686 },
  "sao luis-ma": { nome: "São Luís", estado: "MA", lat: -2.5307, lng: -44.3068 }
};

const DEFAULT_SETTINGS = {
  empresa: "Madcenter Construção",
  telefone: "(86) 99999-4500",
  endereco: "Av. Principal, 1200 - José de Freitas/PI",
  cidadeBase: STORE_LOCATION.city,
  estado: STORE_LOCATION.state,
  latitudeLoja: STORE_LOCATION.lat,
  longitudeLoja: STORE_LOCATION.lng,
  custoKm: 4.6,
  custoAdicionalFixo: 0,
  freteMinimo: 20,
  entregaMoto: "sim",
  horario: "Segunda a sábado, 7h às 18h",
  tema: "light"
};
