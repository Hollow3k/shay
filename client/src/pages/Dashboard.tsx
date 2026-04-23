import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useAuthActions } from '../hooks/useAuthActions.ts';

type ProjectRow = {
  id: string;
  name: string;
  updated_at: string | null;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { handleSignOut } = useAuthActions();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const loadProjects = async () => {
      if (!user) {
        setProjects([]);
        setLoadingProjects(false);
        return;
      }

      setLoadingProjects(true);

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        setProjectError(error.message);
        setProjects([]);
      } else {
        setProjects((data ?? []) as ProjectRow[]);
      }

      setLoadingProjects(false);
    };

    void loadProjects();
  }, [user]);

  const refreshProjects = async () => {
    if (!user) {
      return;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('id, name, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      setProjectError(error.message);
      return;
    }

    setProjects((data ?? []) as ProjectRow[]);
  };

  const openProject = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  const createProject = async () => {
    if (!user || !projectName.trim()) {
      setProjectError('Project name is required.');
      return;
    }

    setCreatingProject(true);
    setProjectError('');

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: projectName.trim(),
        user_id: user.id,
        canvas_data: {},
      })
      .select('id')
      .single();

    setCreatingProject(false);

    if (error) {
      setProjectError(error.message);
      return;
    }

    setProjectName('');
    setIsCreateOpen(false);
    await refreshProjects();

    if (data?.id) {
      navigate(`/project/${data.id}`);
    }
  };

  const onLogout = async () => {
    setLoggingOut(true);

    try {
      await handleSignOut();
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className='min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8'>
      <div className='mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl'>
        <div>
          <p className='text-xs uppercase tracking-[0.35em] text-white/45'>Dashboard</p>
          <h1 className='mt-1 text-2xl font-semibold'>Your projects</h1>
        </div>
        <div className='flex items-center gap-3'>
          <button
            type='button'
            onClick={() => setIsCreateOpen(true)}
            className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200'
          >
            New project +
          </button>
          <button
            type='button'
            onClick={onLogout}
            disabled={loggingOut}
            className='rounded-full border border-white/20 bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60'
          >
            {loggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>

      <div className='mx-auto mt-6 max-w-6xl'>
        {projectError ? <p className='mb-4 text-sm text-white/70'>{projectError}</p> : null}

        {loadingProjects ? (
          <div className='rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-center text-white/70 backdrop-blur-xl'>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className='rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-center text-white/70 backdrop-blur-xl'>
            No projects yet. Create your first one.
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {projects.map((project) => (
              <button
                key={project.id}
                type='button'
                onClick={() => openProject(project.id)}
                className='group rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10'
              >
                <p className='text-xs uppercase tracking-[0.3em] text-white/45'>Project</p>
                <h2 className='mt-3 text-xl font-semibold text-white'>{project.name}</h2>
                <p className='mt-2 text-sm text-white/55'>Open project</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {isCreateOpen ? (
        <div className='fixed inset-0 z-20 flex items-center justify-center px-4'>
          <button
            type='button'
            aria-label='Close create project dialog'
            className='absolute inset-0 cursor-default bg-black/65 backdrop-blur-sm'
            onClick={() => setIsCreateOpen(false)}
          />

          <div className='relative w-full max-w-lg overflow-hidden rounded-4xl border border-white/15 bg-white/10 p-px shadow-[0_30px_120px_rgba(0,0,0,0.65)] backdrop-blur-3xl'>
            <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.16),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))]' />
            <div className='relative rounded-[1.9rem] border border-white/10 bg-black/45 p-6 text-white backdrop-blur-2xl sm:p-8'>
              <div className='mb-5 flex items-start justify-between gap-4'>
                <div>
                  <p className='text-xs uppercase tracking-[0.35em] text-white/50'>Create project</p>
                  <h2 className='mt-2 text-2xl font-semibold'>New project +</h2>
                </div>
                <button
                  type='button'
                  onClick={() => setIsCreateOpen(false)}
                  className='rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-white/70 transition hover:bg-white/15 hover:text-white'
                >
                  Close
                </button>
              </div>

              <input
                type='text'
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder='Project name'
                className='w-full rounded-2xl border border-white/12 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-white/70'
              />

              <div className='mt-5 flex flex-col gap-3 sm:flex-row'>
                <button
                  type='button'
                  onClick={createProject}
                  disabled={creatingProject}
                  className='rounded-2xl bg-white px-4 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {creatingProject ? 'Creating...' : 'Create project'}
                </button>
                <button
                  type='button'
                  onClick={() => setIsCreateOpen(false)}
                  className='rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-medium text-white transition hover:bg-white/10'
                >
                  Cancel
                </button>
              </div>

              {projectError ? <p className='mt-4 text-sm text-white/70'>{projectError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;