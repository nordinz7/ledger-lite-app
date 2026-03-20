import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { addDays, format, isSameDay, isSameMonth, isSameYear, subDays } from 'date-fns';
import { useEffect, useRef } from 'react';
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const WINDOW = 180; // days on each side of today
const ITEM_WIDTH = 54;

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  colors: AppColors;
}

export function DateStrip({ value, onChange, colors }: Props) {
  const listRef = useRef<FlatList<Date>>(null);
  const today = useRef(new Date()).current;
  const startDate = useRef(subDays(today, WINDOW)).current;
  const totalDays = WINDOW * 2 + 1;

  // Pre-build date array once
  const dates = useRef<Date[]>(
    Array.from({ length: totalDays }, (_, i) => addDays(startDate, i)),
  ).current;

  const selectedIndex = dates.findIndex(d => isSameDay(d, value));

  useEffect(() => {
    const idx = dates.findIndex(d => isSameDay(d, value));
    if (idx >= 0 && listRef.current) {
      // Slight delay so layout is ready
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      }, 80);
    }
  }, [value, dates]);

  const S = makeStyles(colors);

  return (
    <FlatList<Date>
      ref={listRef}
      horizontal
      data={dates}
      keyExtractor={d => d.toISOString()}
      showsHorizontalScrollIndicator={false}
      decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.9}
      getItemLayout={(_, index) => ({
        length: ITEM_WIDTH,
        offset: ITEM_WIDTH * index,
        index,
      })}
      initialScrollIndex={Math.max(0, selectedIndex >= 0 ? selectedIndex : WINDOW)}
      contentContainerStyle={{ paddingHorizontal: Spacing.sm }}
      onScrollToIndexFailed={info => {
        // Fallback for when layout isn't ready
        setTimeout(() => {
          listRef.current?.scrollToIndex({
            index: info.index,
            animated: false,
            viewPosition: 0.5,
          });
        }, 300);
      }}
      renderItem={({ item, index }) => {
        const isSelected = isSameDay(item, value);
        const isToday = isSameDay(item, today);
        // Show month label on first of month or first visible item
        const prevDate = index > 0 ? dates[index - 1] : null;
        const showMonth = !prevDate ||
          !isSameMonth(item, prevDate) ||
          !isSameYear(item, prevDate);

        return (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onChange(item)}
            style={[S.item, isSelected && S.itemSelected]}
          >
            {showMonth ? (
              <Text style={[S.monthLabel, isSelected && S.monthLabelSelected]}>
                {format(item, 'MMM yy')}
              </Text>
            ) : (
              <View style={S.monthPlaceholder} />
            )}
            <Text style={[S.dayName, isSelected && S.dayNameSelected]}>
              {format(item, 'EEE')}
            </Text>
            <Text style={[S.dayNum, isSelected && S.dayNumSelected]}>
              {format(item, 'd')}
            </Text>
            {isToday && !isSelected && <View style={[S.todayDot, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        );
      }}
    />
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    item: {
      width: ITEM_WIDTH,
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: 2,
      borderRadius: Radius.md,
      marginHorizontal: 1,
    },
    itemSelected: {
      backgroundColor: colors.primary,
    },
    monthPlaceholder: {
      height: FontSizes.xs + 2,
    },
    monthLabel: {
      fontSize: FontSizes.xs - 1,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 1,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    monthLabelSelected: {
      color: 'rgba(255,255,255,0.75)',
    },
    dayName: {
      fontSize: FontSizes.xs,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    dayNameSelected: {
      color: 'rgba(255,255,255,0.85)',
    },
    dayNum: {
      fontSize: FontSizes.lg,
      fontWeight: '800',
      color: colors.text,
      marginTop: 1,
    },
    dayNumSelected: {
      color: '#FFFFFF',
    },
    todayDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      marginTop: 3,
    },
  });
}
