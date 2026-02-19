'use client';

import { useState, useEffect } from 'react';
import { Loader2, UserMinus, Crown } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { groupKick, groupLeave, GroupInfo } from '@/lib/firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface MemberProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

interface GroupMemberListProps {
  group: GroupInfo;
  isCreator: boolean;
  currentUid: string;
  onRefresh: () => Promise<void>;
}

export default function GroupMemberList({
  group,
  isCreator,
  currentUid,
  onRefresh,
}: GroupMemberListProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUid, setActionUid] = useState<string | null>(null);

  // Fetch member profiles
  useEffect(() => {
    async function fetchMembers() {
      const profiles: MemberProfile[] = [];
      for (const uid of group.memberUids) {
        try {
          const userDoc = await getDoc(doc(getFirebaseDb(), 'users', uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            profiles.push({
              uid,
              displayName: data.displayName || 'Unknown',
              photoURL: data.photoURL || null,
            });
          } else {
            profiles.push({ uid, displayName: 'Unknown', photoURL: null });
          }
        } catch {
          profiles.push({ uid, displayName: 'Unknown', photoURL: null });
        }
      }
      setMembers(profiles);
      setLoading(false);
    }
    fetchMembers();
  }, [group.memberUids]);

  const handleKick = async (targetUid: string) => {
    setActionUid(targetUid);
    try {
      await groupKick({ groupId: group.groupId, targetUid });
      toast({ title: 'Member removed' });
      await onRefresh();
    } catch (err) {
      toast({
        title: 'Failed to remove member',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionUid(null);
    }
  };

  const handleLeave = async () => {
    setActionUid(currentUid);
    try {
      await groupLeave({ groupId: group.groupId });
      toast({ title: 'You left the group' });
      await onRefresh();
    } catch (err) {
      toast({
        title: 'Failed to leave',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionUid(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 mt-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Members ({group.memberCount})
      </h3>
      <div className="space-y-2.5">
        {members.map((member) => {
          const isSelf = member.uid === currentUid;
          const memberIsCreator = member.uid === group.creatorUid;

          return (
            <div key={member.uid} className="flex items-center gap-3">
              <ProfileAvatar
                photoURL={member.photoURL}
                displayName={member.displayName}
                size="xs"
                className="w-8 h-8 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">
                  {member.displayName}
                  {isSelf && <span className="text-gray-400 ml-1">(you)</span>}
                </p>
              </div>
              {memberIsCreator && (
                <Crown className="w-4 h-4 text-amber-500 flex-shrink-0" />
              )}
              {/* Creator can kick non-self members */}
              {isCreator && !isSelf && !memberIsCreator && (
                <button
                  onClick={() => handleKick(member.uid)}
                  disabled={actionUid === member.uid}
                  className="p-1.5 rounded-full hover:bg-red-50 transition-colors"
                >
                  {actionUid === member.uid ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : (
                    <UserMinus className="w-4 h-4 text-red-400" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Leave button for non-creators */}
      {!isCreator && (
        <button
          onClick={handleLeave}
          disabled={actionUid === currentUid}
          className="w-full mt-3 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
        >
          {actionUid === currentUid ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            'Leave Group'
          )}
        </button>
      )}
    </div>
  );
}
