import type { Post } from "./types";
import { post as unionArenaStars } from "./union-arena-stars";
import { post as cardNumbers } from "./card-numbers";

export const POSTS: Post[] = [unionArenaStars, cardNumbers];
