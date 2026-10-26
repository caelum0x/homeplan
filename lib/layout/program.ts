import type { BriefInput, RoomType } from "./types";

export interface ProgramRoom {
  id: string;
  type: RoomType;
  label: string;
  /** "Ideal" area before the budget is scaled to fit the requested square footage. */
  idealArea: number;
  minArea: number;
  minWidth: number;
  zone: "public" | "private" | "garage";
  /** Bedrooms and their attached ensuite are kept as a pair so the layout keeps them adjacent. */
  pairWith?: string;
}

export interface RoomProgram {
  entry: ProgramRoom;
  publicRooms: ProgramRoom[]; // excludes entry, includes great_room/living/kitchen/dining/office/half_bath
  bedrooms: ProgramRoom[];
  privateBaths: ProgramRoom[]; // baths NOT attached as an ensuite (shared, off the hallway)
  garage?: ProgramRoom;
}

const IDEAL_AREA: Record<RoomType, number> = {
  entry: 35,
  great_room: 320,
  living: 170,
  kitchen: 130,
  dining: 110,
  primary_bedroom: 180,
  bedroom: 120,
  primary_bath: 70,
  bath: 45,
  half_bath: 20,
  hallway: 0,
  office: 100,
  garage: 240,
  closet: 20,
};

const MIN_AREA: Record<RoomType, number> = {
  entry: 24,
  great_room: 220,
  living: 120,
  kitchen: 90,
  dining: 80,
  primary_bedroom: 140,
  bedroom: 90,
  primary_bath: 45,
  bath: 35,
  half_bath: 15,
  hallway: 0,
  office: 70,
  garage: 200,
  closet: 12,
};

const MIN_WIDTH: Record<RoomType, number> = {
  entry: 4,
  great_room: 12,
  living: 9,
  kitchen: 8,
  dining: 8,
  primary_bedroom: 10,
  bedroom: 9,
  primary_bath: 6,
  bath: 5,
  half_bath: 4,
  hallway: 3.5,
  office: 8,
  garage: 11,
  closet: 3,
};

export function getMinArea(type: RoomType): number {
  return MIN_AREA[type];
}

function makeRoom(id: string, type: RoomType, label: string, zone: ProgramRoom["zone"]): ProgramRoom {
  return {
    id,
    type,
    label,
    idealArea: IDEAL_AREA[type],
    minArea: MIN_AREA[type],
    minWidth: MIN_WIDTH[type],
    zone,
  };
}

/**
 * Builds the room program from the parsed brief. This is where every one of
 * Maket's reviewed complaints about "nonsensical" layouts gets addressed
 * structurally: bathrooms are explicitly assigned to a bedroom (ensuite) or
 * to the shared hallway, never floating; a half bath only ever lands in the
 * public zone near the entry, never next to a bedroom.
 */
export function buildRoomProgram(input: BriefInput): RoomProgram {
  const entry = makeRoom("entry", "entry", "Entry", "public");

  const publicRooms: ProgramRoom[] = [];
  if (input.openPlan) {
    publicRooms.push(makeRoom("great_room", "great_room", "Great Room (Living + Kitchen + Dining)", "public"));
  } else {
    publicRooms.push(makeRoom("living", "living", "Living Room", "public"));
    publicRooms.push(makeRoom("kitchen", "kitchen", "Kitchen", "public"));
    if (input.hasDining) {
      publicRooms.push(makeRoom("dining", "dining", "Dining Room", "public"));
    }
  }
  if (input.hasOffice) {
    publicRooms.push(makeRoom("office", "office", "Office", "public"));
  }

  const baseBathCount = Math.floor(input.bathrooms);
  const hasHalfBath = input.bathrooms - baseBathCount >= 0.5;
  if (hasHalfBath) {
    publicRooms.push(makeRoom("half_bath", "half_bath", "Powder Room", "public"));
  }

  const bedrooms: ProgramRoom[] = [];
  const primaryBedroom = makeRoom("bedroom_1", "primary_bedroom", "Primary Bedroom", "private");
  bedrooms.push(primaryBedroom);
  for (let i = 2; i <= input.bedrooms; i++) {
    bedrooms.push(makeRoom(`bedroom_${i}`, "bedroom", `Bedroom ${i}`, "private"));
  }

  // Bath assignment: if there's only one full bath total, it's a shared
  // hallway bath (no ensuite — one bathroom for the whole house is honest).
  // Otherwise the primary gets an ensuite, and any remaining full baths
  // become shared hallway baths (realistic for 1-2 extra baths; beyond that
  // we still add them, just acknowledging diminishing realism in a comment).
  const privateBaths: ProgramRoom[] = [];
  if (baseBathCount <= 1) {
    if (baseBathCount === 1) {
      privateBaths.push(makeRoom("bath_shared_1", "bath", "Bathroom", "private"));
    }
  } else {
    const ensuite = makeRoom("bath_primary", "primary_bath", "Primary Bath", "private");
    ensuite.pairWith = primaryBedroom.id;
    primaryBedroom.pairWith = ensuite.id;
    privateBaths.push(ensuite);
    const sharedCount = baseBathCount - 1;
    for (let i = 1; i <= sharedCount; i++) {
      privateBaths.push(makeRoom(`bath_shared_${i}`, "bath", sharedCount === 1 ? "Bathroom" : `Bathroom ${i}`, "private"));
    }
  }

  const garage = input.hasGarage ? makeRoom("garage", "garage", "Garage", "garage") : undefined;

  return { entry, publicRooms, bedrooms, privateBaths, garage };
}
