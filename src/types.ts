export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderPayload {
  items: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  totalPrice: number;
}