/*
  Reference lists — categories, projects, producers, showfields.
  These are small and change rarely: fetch once, cache long, join to shows by id.
  (category / project / producer are NOT sideloadable on shows — this is the join.)
*/
import { cache } from "react";
import { authedGet, REFERENCE_REVALIDATE } from "./client";
import type {
  Category,
  FieldDefinition,
  Producer,
  Project,
  ShowField,
} from "./types";

export const getCategories = cache(async (): Promise<Category[]> => {
  const data = await authedGet<{ categories: Category[] }>("/v1/categories", {
    revalidate: REFERENCE_REVALIDATE,
    tags: ["cablecast-categories"],
  });
  return data.categories ?? [];
});

export const getProjects = cache(async (): Promise<Project[]> => {
  const data = await authedGet<{ projects: Project[] }>("/v1/projects", {
    revalidate: REFERENCE_REVALIDATE,
    tags: ["cablecast-projects"],
  });
  return data.projects ?? [];
});

export const getProducers = cache(async (): Promise<Producer[]> => {
  const data = await authedGet<{ producers: Producer[] }>("/v1/producers", {
    revalidate: REFERENCE_REVALIDATE,
    tags: ["cablecast-producers"],
  });
  return data.producers ?? [];
});

export const getShowFields = cache(
  async (): Promise<{
    showFields: ShowField[];
    fieldDefinitions: FieldDefinition[];
  }> => {
    const data = await authedGet<{
      showFields: ShowField[];
      fieldDefinitions: FieldDefinition[];
    }>("/v1/showfields", {
      revalidate: REFERENCE_REVALIDATE,
      tags: ["cablecast-showfields"],
    });
    return {
      showFields: data.showFields ?? [],
      fieldDefinitions: data.fieldDefinitions ?? [],
    };
  },
);

/** Build an id -> entity map for O(1) joins. */
export function indexById<T extends { id: number }>(items: T[]): Map<number, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/** Find a ShowField by (case-insensitive) name, e.g. "School Related", "Featured". */
export async function findShowFieldByName(
  name: string,
): Promise<ShowField | undefined> {
  const { showFields } = await getShowFields();
  const target = name.toLowerCase();
  return showFields.find((field) => field.name?.toLowerCase() === target);
}

/** Resolve a category name to its id (case-insensitive). */
export async function categoryIdByName(
  name: string,
): Promise<number | undefined> {
  const categories = await getCategories();
  const target = name.toLowerCase();
  return categories.find((c) => c.name?.toLowerCase() === target)?.id;
}

/** Resolve a project name to its id (case-insensitive). */
export async function projectIdByName(
  name: string,
): Promise<number | undefined> {
  const projects = await getProjects();
  const target = name.toLowerCase();
  return projects.find((p) => p.name?.toLowerCase() === target)?.id;
}
