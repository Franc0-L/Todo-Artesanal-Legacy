import type { OptionType } from "../../../types/domain";
import type { DishVersion } from "../../platos/types/dish-version";
import type { MenuVersionSummary } from "../../menus/types/menu-version";
import type { WeekDay } from "./week-day";

export type OfferModality = "general" | "opcional";

export interface WeekDayOption {
  id: string;
  weekDayId: string;
  offerModality: OfferModality;
  optionType: OptionType;
  dishVersion: DishVersion | null;
  menuVersion: MenuVersionSummary | null;
  createdAt: string;
}

export type AddDayOptionInput =
  | {
      weekDayId: string;
      offerModality?: OfferModality;
      optionType: "dish";
      dishVersionId: string;
    }
  | {
      weekDayId: string;
      offerModality?: OfferModality;
      optionType: "menu";
      menuVersionId: string;
    };

export type UpdateDayOptionInput =
  | {
      offerModality: OfferModality;
      optionType: "dish";
      dishVersionId: string;
    }
  | {
      offerModality: OfferModality;
      optionType: "menu";
      menuVersionId: string;
    };

export interface WeekOfferDay {
  weekDay: WeekDay;
  options: WeekDayOption[];
}

export interface WeekOffer {
  weekId: string;
  days: WeekOfferDay[];
}
